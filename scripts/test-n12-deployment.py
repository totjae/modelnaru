#!/usr/bin/env python3
"""N12 destructive fixture, ONLY in a fresh /tmp/modelnaru-n12-* checkout.

Uses generated credentials in memory; never records terminal QR, cookies or SQL.
Requires Docker Compose/buildx images already built for the unique project.
The caller removes the dedicated project/builder and checkout after inspection.
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
import time
import uuid

ROOT = Path.cwd().resolve()
assert ROOT.parent == Path('/tmp') and ROOT.name.startswith('modelnaru-n12-')
PROJECT = ROOT.name
os.environ['COMPOSE_PROJECT_NAME'] = PROJECT
os.environ['BUILDX_BUILDER'] = PROJECT
os.environ['APICHAT_UID'] = str(os.getuid())
os.environ['APICHAT_GID'] = str(os.getgid())
DC = ['docker', 'compose', '--env-file', '.runtime.env']


def run(args, data=None, ok=True):
    p = subprocess.run(args, input=data, text=True, capture_output=True, timeout=900)
    if args[0] == './bin/modelnaru':
        # These wrapper commands never print secrets; interactive CLI is separate.
        Path('operation.log').write_text(p.stdout + p.stderr)
    if ok and p.returncode:
        # Do not echo command output: it could contain generated secrets.
        raise AssertionError('Command failed: ' + ' '.join(args[:5]) + ' (output withheld)')
    return p


def passed(name):
    print('PASS ' + name, flush=True)


def terminal(args, prompts=()):
    master, slave = pty.openpty()
    p = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    buf = b''
    sent = 0
    deadline = time.monotonic() + 120
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.1)[0]:
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
        assert p.wait(timeout=5) == 0 and sent == len(prompts), 'Interactive CLI failed (transcript discarded)'
    finally:
        if p.poll() is None:
            p.kill()
            p.wait()
        os.close(master)
        del buf


def totp(secret):
    value = hmac.new(base64.b32decode(secret), struct.pack('>Q', int(time.time()) // 30), hashlib.sha1).digest()
    off = value[-1] & 15
    return str((struct.unpack('>I', value[off:off+4])[0] & 0x7fffffff) % 1000000).zfill(6)


def config_secret():
    return re.search(r'^  totpSecret: ([A-Z2-7]+)$', Path('config.yaml').read_text(), re.M)[1]


def http(path, method='GET', body=None, cookie='', extra=None):
    conn = http_client.HTTPConnection('127.0.0.1', PORT, timeout=25)
    headers = {'Host': 'n12.example.invalid', 'Origin': 'https://n12.example.invalid', 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json', 'Cookie': cookie}
    if extra:
        headers.update(extra)
    conn.request(method, '/api' + path, json.dumps(body) if body is not None else None, headers)
    res = conn.getresponse()
    raw = res.read()
    assert not raw or 'application/json' in res.getheader('Content-Type', ''), 'Non-JSON HTTP response: status ' + str(res.status)
    result = (res.status, json.loads(raw) if raw else None, res.getheaders())
    conn.close()
    return result


def sql(query):
    return run(DC + ['exec', '-T', 'postgres', 'psql', '-U', 'modelnaru', '-d', 'modelnaru_test', '-At', '-v', 'ON_ERROR_STOP=1'], query).stdout.strip()


def wait_for(fn, expected, timeout=40):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            value = fn()
            if expected(value):
                return value
        except (OSError, ValueError, http_client.HTTPException):
            pass
        time.sleep(0.2)
    raise AssertionError('Timed out waiting for fixture state')


assert not Path('config.yaml').exists(), 'Requires a fresh fixture; never overwrite an installation'
password = secrets.token_urlsafe(24)
terminal(['./bin/apichat-admin', 'init'], [('고정 관리자 ID', 'n12admin'), ('공개 HTTPS 주소', 'https://n12.example.invalid'), ('관리자 비밀번호 (10자 이상)', password), ('관리자 비밀번호 확인', password)])
assert not Path('data/valkey').exists()
for file in ['config.yaml', 'secrets/database_url', 'secrets/postgres_password', 'secrets/provider_master_key']:
    assert Path(file).stat().st_mode & 0o777 == 0o600
passed('interactive init / private files / no Valkey directory')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    PORT = sock.getsockname()[1]
cfg = Path('config.yaml')
cfg.write_text(cfg.read_text().replace('port: 32432', f'port: {PORT}'))
dbfile = Path('secrets/database_url')
dbfile.write_text(dbfile.read_text().replace('/modelnaru\n', '/modelnaru_test\n'))
Path('mock.cjs').write_text("""const http=require('node:http'); let calls=0;
http.createServer((req,res)=>{ if(req.url==='/calls'){res.end(String(calls));return;}
calls++; res.writeHead(200,{'content-type':'text/event-stream'});
res.write('data: '+JSON.stringify({choices:[{delta:{content:'N12 partial 🙂'},finish_reason:null}],usage:{prompt_tokens:3,completion_tokens:2}})+'\\n\\n');
const timer=setInterval(()=>res.write(': keepalive\\n\\n'),2000); res.on('close',()=>clearInterval(timer));
}).listen(9090,'0.0.0.0');""")
Path('compose.override.yaml').write_text(f"""services:
  gateway:
    cpus: 0.25
    mem_limit: 128m
  web:
    cpus: 0.5
    mem_limit: 512m
  api:
    cpus: 0.75
    mem_limit: 768m
  migrate:
    cpus: 0.5
    mem_limit: 256m
  postgres:
    cpus: 0.5
    mem_limit: 256m
    environment:
      POSTGRES_DB: modelnaru_test
  admin-tool:
    cpus: 0.5
    mem_limit: 256m
  mock:
    image: {PROJECT}-api
    command: [node, /fixture/mock.cjs]
    volumes: [./mock.cjs:/fixture/mock.cjs:ro]
    networks: [frontend]
    cpus: 0.25
    mem_limit: 128m
""")
cfg.chmod(0o644)
assert run(['./bin/apichat-admin', 'validate'], ok=False).returncode != 0
cfg.chmod(0o600)
original_config = cfg.read_text()
cfg.write_text(original_config.replace('version: 2', 'version: 1', 1))
assert run(['./bin/apichat-admin', 'validate'], ok=False).returncode != 0
cfg.write_text(original_config)
del original_config
run(['./bin/apichat-admin', 'validate'])
passed('validate accepts v2 and rejects v1 / unsafe config permissions')
run(['./bin/modelnaru', 'start'])
run(['./bin/modelnaru', 'health'])
run(['./bin/modelnaru', 'status'])
web = http_client.HTTPConnection('127.0.0.1', PORT)
web.request('GET', '/')
page = web.getresponse()
assert page.status == 200
html = page.read().decode()
assets = re.findall(r'"(/_next/static/[^"?]+)', html)
assert assets
for asset in [assets[0], '/modelnaru-logo.svg']:
    web.request('GET', asset)
    response = web.getresponse()
    assert response.status == 200 and len(response.read()) > 0
web.close()
passed('standalone Web serves HTML, bundled static asset and logo')
log = subprocess.Popen(['./bin/modelnaru', 'logs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
time.sleep(2)
assert log.poll() is None
os.killpg(log.pid, 15)
log.wait(timeout=5)
assert sql('SELECT count(*) FROM schema_migrations;') == '20'
passed('README start/status/logs/health / twenty migrations')
for service in ['gateway', 'web', 'api', 'postgres']:
    cid = run(DC + ['ps', '-q', service]).stdout.strip()
    inspect = json.loads(run(['docker', 'inspect', cid]).stdout)[0]
    assert inspect['HostConfig']['LogConfig']['Config'] == {'max-file': '3', 'max-size': '10m'}
    assert inspect['HostConfig']['Memory'] > 0 and inspect['HostConfig']['NanoCpus'] > 0
    if service == 'api':
        assert inspect['Config']['StopTimeout'] == 40
passed('running containers have log rotation, fixture resources and 40 second stop timeout')
oldsecret = config_secret()
status, _, headers = http('/auth/login', 'POST', {'username': 'n12admin', 'password': password, 'totp': totp(oldsecret)})
assert status == 200, 'Initial administrator login failed'
cookie = '; '.join(value.split(';')[0] for key, value in headers if key.lower() == 'set-cookie')
assert http('/auth/session', cookie=cookie)[0] == 200
assert run(['./bin/apichat-admin', 'reset-totp'], ok=False).returncode != 0
assert config_secret() == oldsecret
terminal(['./bin/apichat-admin', 'reset-totp'])
assert config_secret() != oldsecret
run(['./bin/apichat-admin', 'validate'])
run(['./bin/modelnaru', 'restart'])
assert http('/auth/session', cookie=cookie)[0] == 401
assert http('/auth/login', 'POST', {'username': 'n12admin', 'password': password, 'totp': totp(oldsecret)})[0] == 401
assert http('/auth/login', 'POST', {'username': 'n12admin', 'password': password, 'totp': totp(config_secret())})[0] == 200
passed('interactive TOTP recovery / old session and old code rejected / new code accepted')

# Generated user/session fixture, separate from real administrator login above.
user, session, connection, model = [str(uuid.uuid4()) for _ in range(4)]
token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
mockid = run(DC + ['ps', '-q', 'mock']).stdout.strip()
mockip = list(json.loads(run(['docker', 'inspect', mockid]).stdout)[0]['NetworkSettings']['Networks'].values())[0]['IPAddress']
sql(f"""INSERT INTO users(id,username,username_normalized,password_hash) VALUES('{user}','n12user','n12user','$argon2id$fixture');
INSERT INTO sessions(id,principal_type,user_id,account_key,token_hash,csrf_token_hash,credential_fingerprint,idle_expires_at,absolute_expires_at)
VALUES('{session}','user','{user}','user:{user}',decode('{sha(token)}','hex'),decode('{sha(csrf)}','hex'),decode('{sha('modelnaru:user-credential:v1'+chr(0)+user+chr(0)+'1')}','hex'),now()+interval '1 hour',now()+interval '1 day');
INSERT INTO provider_connections(id,template_id,name,base_url,kind,protocol,auth_mode,destination_kind,approved_local_ip,approved_local_port)
VALUES('{connection}','custom-openai','N12 mock','http://{mockip}:9090/v1','custom','openai-chat-completions','none','local','{mockip}',9090);
INSERT INTO provider_models(id,provider_connection_id,model_id,is_enabled) VALUES('{model}','{connection}','n12fixture',true);
INSERT INTO user_model_permissions(user_id,provider_model_id) VALUES('{user}','{model}');""")
usercookie = f'modelnaru_session={token}; modelnaru_csrf={csrf}'
extra = {'x-csrf-token': csrf}


def start_job():
    code, conv, _ = http('/conversations', 'POST', {'defaultProviderModelId': model}, usercookie, extra)
    assert code == 201
    path = '/conversations/' + conv['id'] + '/jobs'
    code, body, _ = http(path, 'POST', {'settingsRevision': '1', 'content': 'N12 isolated fixture', 'providerModelId': model, 'parameters': {}}, usercookie, {**extra, 'idempotency-key': str(uuid.uuid4())})
    assert code == 202
    return path + '/' + body['job']['id'], body['job']['id']


path, job = start_job()
stream = http_client.HTTPConnection('127.0.0.1', PORT, timeout=25)
stream.request('GET', '/api' + path + '/events', headers={'Host': 'n12.example.invalid', 'Cookie': usercookie})
response = stream.getresponse()
assert response.status == 200
started = time.monotonic()
seen = set()
while not {'snapshot', 'append', 'heartbeat'} <= seen and time.monotonic() - started < 22:
    line = response.readline().decode()
    if line.startswith('event: '):
        seen.add(line[7:].strip())
assert {'snapshot', 'append', 'heartbeat'} <= seen, 'Gateway buffered SSE frames'
passed('gateway delivers snapshot, append and fifteen second heartbeat before completion')
stopping = subprocess.Popen(DC + ['stop', 'api'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
assert stopping.wait(timeout=45) == 0
stream.close()
state = sql(f"SELECT j.status||'|'||j.error_code||'|'||m.status||'|'||u.status||'|'||r.state||'|'||j.checkpoint_content||'|'||u.input_tokens||'|'||u.output_tokens FROM chat_jobs j JOIN messages m ON m.id=j.assistant_message_id JOIN usage_events u ON u.job_id=j.id JOIN chat_quota_reservations r ON r.job_id=j.id WHERE j.id='{job}'")
assert state == 'failed|CHAT_SERVER_SHUTDOWN|failed|failed|charged|N12 partial 🙂|3|2', 'Graceful shutdown persistence mismatch'
run(DC + ['up', '-d', '--no-deps', '--wait', 'api'])
passed('SIGTERM commits partial body, shutdown status, usage and quota before DB close')
path, job = start_job()
wait_for(lambda: http(path, cookie=usercookie)[1]['job'], lambda j: bool(j['content']))
run(DC + ['kill', '-s', 'SIGKILL', 'api'])
run(DC + ['up', '-d', '--no-deps', '--wait', 'api'])
wait_for(lambda: http(path, cookie=usercookie)[1]['job'], lambda j: j['errorCode'] == 'CHAT_SERVER_RESTARTED')
calls = run(DC + ['exec', '-T', 'mock', 'node', '-e', "fetch('http://127.0.0.1:9090/calls').then(r=>r.text()).then(console.log)"]).stdout.strip()
assert calls == '2'
passed('SIGKILL recovery / no automatic provider retry')
checksum = sql('SELECT checksum FROM schema_migrations ORDER BY version LIMIT 1;')
sql("UPDATE schema_migrations SET checksum='fixture-mismatch' WHERE version=(SELECT version FROM schema_migrations ORDER BY version LIMIT 1);")
assert run(DC + ['run', '--rm', '-T', 'migrate'], ok=False).returncode != 0
sql(f"UPDATE schema_migrations SET checksum='{checksum}' WHERE version=(SELECT version FROM schema_migrations ORDER BY version LIMIT 1);")
run(['./bin/modelnaru', 'update'])
assert sql('SELECT count(*) FROM schema_migrations;') == '20'
assert sql('SELECT count(*) FROM chat_jobs;') == '2'
run(['./bin/modelnaru', 'health'])
passed('checksum mismatch rejected / compatible same-release update preserves data')
run(['./bin/modelnaru', 'stop'])
assert not run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + PROJECT]).stdout.strip()
run(['./bin/modelnaru', 'start'])
run(['./bin/modelnaru', 'health'])
assert sql('SELECT count(*) FROM chat_jobs;') == '2'
run(['./bin/modelnaru', 'stop'])
passed('stop/start preserves database and final stop removes fixture containers')
print('N12 deployment fixture completed; generated secrets remain only in isolated checkout pending cleanup.', flush=True)
