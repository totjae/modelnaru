#!/usr/bin/env python3
"""One approved N14 release. No provider credentials or paid calls.

Run prepare, then cutover. Keeps v1 directory/data/images for rollback.
Generated bootstrap credentials never leave this server or appear in output.
"""
import base64
import hashlib
import hmac
import http.client as http_client
import json
import os
from pathlib import Path
import pty
import re
import secrets
import select
import socket
import struct
import subprocess
import sys
import time
import uuid

ROOT = Path('/home/totquf4171/modelnaru-v2-20261002')
OLD = Path('/home/totquf4171/modelnaru')
assert Path.cwd().resolve() == ROOT and ROOT != OLD
os.umask(0o077)
os.environ.update(COMPOSE_PROJECT_NAME='modelnaru-v2', APICHAT_UID=str(os.getuid()), APICHAT_GID=str(os.getgid()))
DC = ['docker', 'compose', '--env-file', '.env', '--env-file', '.runtime.env']
STATE = ROOT / 'n14-state.json'
PRIVATE = ROOT / 'secrets/n14-bootstrap.json'
DOMAIN = 'chat.mihoservice.xyz'
MODE = sys.argv[1]


def run(args, data=None):
    r = subprocess.run(args, input=data, text=True, capture_output=True, timeout=300)
    if r.returncode:
        raise RuntimeError('Command failed (sensitive output withheld): ' + ' '.join(args[:3]))
    return r.stdout.strip()


def save(state):
    STATE.write_text(json.dumps(state, indent=2))


def terminal(args, prompts):
    master, slave = pty.openpty()
    p = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    buf, sent = b'', 0
    deadline = time.monotonic() + 120
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], .1)[0]:
                try:
                    buf += os.read(master, 65536)
                except OSError:
                    break
            if sent < len(prompts) and prompts[sent][0].encode() in buf:
                os.write(master, (prompts[sent][1] + '\r').encode())
                sent += 1
                buf = b''
            if p.poll() is not None:
                break
        assert p.wait(timeout=5) == 0 and sent == len(prompts), 'CLI init failed; transcript discarded'
    finally:
        if p.poll() is None:
            p.kill()
            p.wait()
        os.close(master)


def config_change(port, restore_admin=False):
    code = r'''
const {createRequire}=await import('node:module');
const require=createRequire('/workspace/tools/admin-cli/package.json');
const {parse}=require('yaml');
const {readFile}=await import('node:fs/promises');
const {writeConfigAtomic}=await import('/workspace/packages/config/dist/index.js');
const config=parse(await readFile('/deployment/config.yaml','utf8'));
config.server.port=Number(process.env.N14_PORT);
config.server.trustProxy.addresses=[process.env.N14_SUBNET];
if(process.env.N14_RESTORE==='yes')config.admin=parse(await readFile('/old-config.yaml','utf8')).admin;
await writeConfigAtomic('/deployment/config.yaml',config);
'''
    subnet = run(['docker', 'network', 'inspect', '--format', '{{(index .IPAM.Config 0).Subnet}}', 'modelnaru-v2_frontend'])
    run(['docker', 'run', '--rm', '--network', 'none', '--user', f'{os.getuid()}:{os.getgid()}',
         '-v', str(ROOT)+':/deployment', '-v', str(OLD/'config.yaml')+':/old-config.yaml:ro',
         '-e', f'N14_PORT={port}', '-e', 'N14_SUBNET='+subnet,
         '-e', 'N14_RESTORE='+('yes' if restore_admin else 'no'), '--entrypoint', 'node',
         'modelnaru-v2-admin-tool', '--input-type=module', '-e', code])
    run(['./bin/apichat-admin', 'validate'])
    run(['./bin/apichat-admin', 'render-env'])


def sql(query):
    return run(DC + ['exec', '-T', 'postgres', 'psql', '-U', 'modelnaru', '-d', 'modelnaru', '-Atc', query])


def otp(secret):
    value = hmac.new(base64.b32decode(secret), struct.pack('>Q', int(time.time())//30), hashlib.sha1).digest()
    off = value[-1] & 15
    return str((struct.unpack('>I', value[off:off+4])[0] & 0x7fffffff) % 1000000).zfill(6)


def connection(public):
    if not public:
        return http_client.HTTPConnection('127.0.0.1', 32433, timeout=30)
    c = http_client.HTTPSConnection(DOMAIN, timeout=30)
    # This host cannot loop back through its WAN IP. Keep TLS SNI and certificate
    # hostname verification, connecting to the same host Nginx via loopback.
    # External HTTPS is independently checked from the workstation after cutover.
    c._create_connection = lambda address, *args, **kwargs: socket.create_connection(('127.0.0.1', 443), *args, **kwargs)
    return c


def headers(cookie=''):
    h = {'Host': DOMAIN, 'Origin': 'https://'+DOMAIN, 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json', 'Cookie': cookie}
    csrf = next((v.split('=', 1)[1] for v in cookie.split('; ') if v.startswith('modelnaru_csrf=')), '')
    h.update({'x-csrf-token': csrf, 'idempotency-key': str(uuid.uuid4())})
    return h


def http(path, method='GET', body=None, cookie='', public=False):
    c = connection(public)
    c.request(method, '/api'+path, json.dumps(body) if body is not None else None, headers(cookie))
    r = c.getresponse()
    raw, status, hs = r.read(), r.status, r.getheaders()
    c.close()
    return status, json.loads(raw) if raw else None, hs


def login(username, password, totp=None, public=False):
    body = {'username': username, 'password': password}
    if totp:
        body['totp'] = totp
    status, _, hs = http('/auth/login', 'POST', body, public=public)
    assert status == 200, 'HTTP login failed: '+str(status)
    return '; '.join(v.split(';')[0] for k,v in hs if k.lower()=='set-cookie')


def smoke(state, private, public=False):
    cookie = login('n14smoke', private['password'], public=public)
    def call(path, method='GET', body=None):
        return http(path, method, body, cookie, public)
    status, conversation, _ = call('/conversations', 'POST', {'defaultProviderModelId': state['modelId'], 'requestTraceLimit': 0})
    assert status == 201
    prefix = '/conversations/'+conversation['id']
    for cancel in [False, True]:
        status, body, _ = call(prefix+'/jobs', 'POST', {'settingsRevision': '1', 'providerModelId': state['modelId'], 'content': 'N14 deployment smoke', 'parameters': {'maxOutputTokens': 64}})
        assert status == 202, 'Job start failed: '+str(status)
        path = prefix+'/jobs/'+body['job']['id']
        c = connection(public)
        started = time.monotonic()
        c.request('GET', '/api'+path+'/events', headers=headers(cookie))
        r = c.getresponse()
        assert r.status == 200
        while not r.readline().startswith(b'event: snapshot'):
            assert time.monotonic()-started < 4, 'SSE first snapshot buffered'
        assert time.monotonic()-started < 4, 'SSE first snapshot buffered'
        r.close()
        c.close()
        if cancel:
            assert call(path+'/cancel', 'POST', {})[0] == 204
        deadline = time.monotonic()+25
        while time.monotonic()<deadline:
            job=call(path)[1]['job']
            if job['status'] in ['completed','cancelled','failed']:
                break
            time.sleep(.2)
        assert job['status']==('cancelled' if cancel else 'completed'), 'Unexpected terminal state'
        if not cancel:
            assert job['content']=='N14 OK', 'Snapshot content mismatch'
            c=connection(public)
            c.request('GET','/api'+path+'/events',headers=headers(cookie))
            r=c.getresponse()
            assert r.status==200
            frames=r.read()
            snapshot=json.loads(next(line[6:] for line in frames.splitlines() if line.startswith(b'data: ')))
            assert snapshot['status']=='completed' and snapshot['revision']==job['revision'] and snapshot['contentBytes']==len(job['content'].encode())
            c.close()
    assert call(prefix,'DELETE')[0]==204
    state['httpsProxySmokePassed' if public else 'stagingSmokePassed']=True
    save(state)
    print('PASS '+('host HTTPS with verified SNI' if public else 'staging')+' login/generation/disconnect/snapshot/SSE/cancel',flush=True)


if MODE in ['prepare','verify']:
    if MODE == 'prepare':
        assert not STATE.exists() and not (ROOT/'config.yaml').exists()
        old_names=['modelnaru-'+x+'-1' for x in ['api','web','gateway','postgres','valkey']]
        inspected=json.loads(run(['docker','inspect',*old_names]))
        state={'release':str(ROOT),'oldRoot':str(OLD),'project':'modelnaru-v2','oldContainers':old_names,
               'oldImages':{i['Name'].strip('/'):i['Image'] for i in inspected},'cutover':False,
               'sourceArchiveSha256':hashlib.sha256((ROOT/'source.tar.gz').read_bytes()).hexdigest()}
        state['oldConfigSha256']=hashlib.sha256((OLD/'config.yaml').read_bytes()).hexdigest()
        save(state)
        for role in ['api','web']:
            run(['docker','tag',state['oldImages']['modelnaru-'+role+'-1'],'modelnaru-rollback-20261002-'+role])
        password=secrets.token_urlsafe(24)
        terminal(['./bin/apichat-admin','init'], [('고정 관리자 ID','n14bootstrap'),('공개 HTTPS 주소','https://'+DOMAIN),('관리자 비밀번호 (10자 이상)',password),('관리자 비밀번호 확인',password)])
        private={'password':password}
        PRIVATE.write_text(json.dumps(private))
        run(['docker','network','create','modelnaru-v2_frontend'])
        (ROOT/'compose.override.yaml').write_text('''name: modelnaru-v2
services:
      api:
        cpus: 1.5
        mem_limit: 1024m
      web:
        cpus: 0.5
        mem_limit: 512m
      postgres:
        cpus: 0.75
        mem_limit: 512m
      gateway:
        cpus: 0.25
        mem_limit: 128m
      migrate:
        cpus: 0.5
        mem_limit: 256m
      admin-tool:
        cpus: 0.5
        mem_limit: 256m
    networks:
      frontend:
        external: true
        name: modelnaru-v2_frontend
    ''')
        config_change(32433)
        run(DC+['up','-d','--no-build','--wait'])
        assert sql('select count(*) from schema_migrations;')=='20'
        run(DC+['run','--rm','-T','migrate'])
        state['migrationChecksumVerified']=True
        mock=r'''const http=require('node:http'); http.createServer((q,r)=>{q.resume();q.on('end',()=>{r.writeHead(200,{'content-type':'text/event-stream'});const d=t=>r.write('data: '+JSON.stringify({choices:[{delta:{content:t},finish_reason:null}]})+'\n\n');d('N14 ');const timer=setTimeout(()=>{d('OK');r.end('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:3}})+'\n\ndata: [DONE]\n\n');},6000);r.on('close',()=>clearTimeout(timer));});}).listen(9090,'0.0.0.0');'''
        (ROOT/'n14-mock.cjs').write_text(mock)
        run(['docker','run','-d','--name','modelnaru-n14-smoke','--network','modelnaru-v2_frontend','--cpus','.1','--memory','128m','-v',str(ROOT/'n14-mock.cjs')+':/fixture.cjs:ro','modelnaru-v2-api','node','/fixture.cjs'])
    else:
        state=json.loads(STATE.read_text())
        private=json.loads(PRIVATE.read_text())
        password=private['password']
        assert not state.get('prepared') and not state['cutover']
    ip=list(json.loads(run(['docker','inspect','modelnaru-n14-smoke']))[0]['NetworkSettings']['Networks'].values())[0]['IPAddress']
    secret=re.search(r'^  totpSecret: ([A-Z2-7]+)$',(ROOT/'config.yaml').read_text(),re.M)[1]
    admin=login('n14bootstrap',password,otp(secret))
    def admin_call(path,method='GET',body=None):return http(path,method,body,admin)
    if 'userId' not in state:
        status,provider,_=admin_call('/admin/provider-connections/custom','POST',{'name':'N14 temporary smoke','baseUrl':'http://'+ip+':9090/v1','authMode':'none','destinationKind':'local','approvedLocalIp':ip,'approvedLocalPort':9090})
        assert status==201, 'Custom fixture registration failed: '+str(status)
        state['providerId']=provider['id']
        status,model,_=admin_call('/admin/provider-connections/'+provider['id']+'/models/manual','POST',{'modelId':'n14-smoke'})
        assert status==201
        state['modelId']=model['id']
        assert admin_call('/admin/provider-models/'+model['id'],'PATCH',{'isEnabled':True,'contextWindow':8192,'maxOutputTokens':64})[0]==200
        status,user,_=admin_call('/admin/users','POST',{'username':'n14smoke','password':password,'displayName':'N14 temporary smoke'})
        assert status==201
        state['userId']=user['id']
        assert admin_call('/admin/access/users/'+user['id'],'PUT',{'dailyRequestLimit':10,'permissions':[{'providerModelId':model['id'],'dailyRequestLimit':10}]})[0]==200
        save(state)
    smoke(state,private)
    config_change(32433,True)
    run(DC+['up','-d','--no-build','--force-recreate','--wait','api'])
    assert http('/auth/session',cookie=admin)[0]==401
    state['adminCredentialsPreserved']=True
    state['prepared']=True
    save(state)
    print('PASS new release prepared; existing admin preserved; v1 still running',flush=True)
elif MODE == 'cutover':
    state=json.loads(STATE.read_text());private=json.loads(PRIVATE.read_text())
    assert state.get('prepared') and not state['cutover']
    if state.get('rollback'):
        state['previousAttemptRolledBack']=True
    assert sql('select count(*) from schema_migrations;')=='20'
    run(DC+['run','--rm','-T','migrate'])
    state['migrationChecksumVerified']=True
    save(state)
    assert hashlib.sha256((OLD/'config.yaml').read_bytes()).hexdigest()==state['oldConfigSha256']
    active=run(['docker','exec','modelnaru-postgres-1','psql','-U','modelnaru','-d','modelnaru','-Atc',"select count(*) from messages where status in ('pending','streaming');"])
    assert active=='0','Existing generation active; defer cutover'
    try:
        run(['docker','stop',*state['oldContainers']])
        config_change(32432,True)
        run(DC+['up','-d','--no-build','--force-recreate','--wait','api','gateway'])
        assert http('/health/ready',public=True)[0]==200
        smoke(state,private,True)
        # Remove exactly our generated fixtures from the new DB, never v1 data.
        sql("DELETE FROM users WHERE id='"+str(uuid.UUID(state['userId']))+"'; DELETE FROM provider_connections WHERE id='"+str(uuid.UUID(state['providerId']))+"';")
        run(['docker','rm','-f','modelnaru-n14-smoke'])
        PRIVATE.unlink()
        (ROOT/'n14-mock.cjs').unlink()
        state['cutover']=True;state['fixtureRemoved']=True;state['rollback']=False
        state['newImages']={i['Name'].strip('/'):i['Image'] for i in json.loads(run(['docker','inspect',*['modelnaru-v2-'+x+'-1' for x in ['api','web','gateway','postgres']]]))}
        save(state)
        print('PASS N14 public HTTPS cutover; v1 preserved stopped; fixture removed',flush=True)
    except Exception:
        run(DC+['stop','gateway','api','web'])
        run(['docker','start','modelnaru-postgres-1','modelnaru-valkey-1'])
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            if run(['docker','inspect','--format','{{.State.Health.Status}}','modelnaru-postgres-1'])=='healthy':
                break
            time.sleep(1)
        run(['docker','start','modelnaru-api-1','modelnaru-web-1','modelnaru-gateway-1'])
        state['rollback']=True;save(state)
        raise
else:
    raise SystemExit('Use prepare, verify, or cutover')
