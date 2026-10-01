#!/usr/bin/env python3
"""Create ONLY a fresh, isolated /tmp/modelnaru-n13-server-* test environment.

No production mounts, secrets, providers, host nginx changes or paid requests.
Leave the private environment available for subsequent acceptance; cleanup is
documented in the generated state.json. Requires the approved code-only archive.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path.cwd().resolve()
assert ROOT.parent == Path('/tmp') and ROOT.name.startswith('modelnaru-n13-server-')
NAME = ROOT.name.lower()  # Docker image repositories require lowercase names.
BASE = 'sha256:c688a03b51ec2784ccf3defdbbdd714f52d5cb92cd010eaa205a6db35edc45d3'
LOCK = hashlib.sha256((ROOT / 'pnpm-lock.yaml').read_bytes()).hexdigest()
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=900)
    if result.returncode:
        # Build logs contain code/compiler diagnostics, not fixture credentials.
        if args[:2] == ['docker', 'buildx']:
            (ROOT / 'build-failure.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Fixture command failed: ' + ' '.join(args[:3]))
    return result.stdout.strip()


def ready(name):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        status = run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name])
        if status == 'healthy':
            return
        if status == 'unhealthy':
            raise RuntimeError('Fixture unhealthy: ' + name)
        time.sleep(1)
    raise RuntimeError('Fixture health deadline: ' + name)


assert not any((ROOT / path).exists() for path in ['state.json', 'private', 'data']), 'Fresh environment required'
actual = run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint',
              'sha256sum', BASE, '/workspace/pnpm-lock.yaml']).split()[0]
assert actual == LOCK, 'Existing Linux dependencies must match current lockfile'
(ROOT / 'Dockerfile.n13').write_text(f'''FROM {NAME}-api AS build
FROM modelnaru-web:latest
COPY --from=build /workspace/apps/web/.next/standalone /workspace
COPY --from=build /workspace/apps/web/.next/static /workspace/apps/web/.next/static
COPY --from=build /workspace/apps/web/public /workspace/apps/web/public
''')
builder = NAME + '-build'
run(['docker', 'create', '--name', builder, '--network', 'none', '--cpus', '1.5', '--memory', '3g',
     '--user', 'root', '-v', str(ROOT)+':/fixture:ro', '--entrypoint', 'sh', BASE, '-c',
     'cp -a /fixture/. /workspace/ && cd /workspace && pnpm --filter @modelnaru/config build && '
     'pnpm --filter @modelnaru/database build && pnpm --filter @modelnaru/api build && '
     'pnpm --filter @modelnaru/web build'])
try:
    run(['docker', 'start', '-a', builder])
    assert run(['docker','inspect','--format','{{.State.ExitCode}}',builder]) == '0', 'Linux build failed'
    run(['docker','commit','--change','USER node','--change','WORKDIR /workspace/apps/api',
         '--change','ENTRYPOINT ["docker-entrypoint.sh"]','--change','CMD ["node","--enable-source-maps","dist/main.js"]',
         builder, NAME+'-api'])
    print('PASS current Linux API/Web build', flush=True)
finally:
    run(['docker', 'rm', builder])
run(['docker','build','--network','none','-f','Dockerfile.n13','-t',NAME+'-web','.'])

for directory in ['private', 'data/uploads', 'data/temp', 'data/logs', 'data/postgres']:
    (ROOT / directory).mkdir(parents=True, exist_ok=True)
api_image = NAME + '-api'
frontend, backend = NAME + '-frontend', NAME + '-backend'
run(['docker', 'network', 'create', frontend])
run(['docker', 'network', 'create', '--internal', backend])
subnet = run(['docker', 'network', 'inspect', '--format', '{{(index .IPAM.Config 0).Subnet}}', frontend])
init = r'''
const {createRequire}=await import('node:module');
const require=createRequire('/workspace/tools/admin-cli/package.json');
const {hash}=require('@node-rs/argon2'),{parse,stringify}=require('yaml');
const {readFile,writeFile}=await import('node:fs/promises');
const {randomBytes}=await import('node:crypto');
const password=randomBytes(24).toString('base64url');
const dbPassword=randomBytes(24).toString('base64url');
// Generate a base32 TOTP secret without recording it in output.
let bits='';for(const b of randomBytes(20))bits+=b.toString(2).padStart(8,'0');
let secret='';for(let i=0;i<bits.length;i+=5)secret+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i,i+5),2)];
const config=parse(await readFile('/fixture/config.example.yaml','utf8'));
config.server.publicBaseUrl='https://test-chat.mihoservice.xyz';
config.security.allowedHosts=['test-chat.mihoservice.xyz'];
config.server.trustProxy.addresses=[process.env.N13_TRUST_SUBNET];
config.admin={username:'n13admin',passwordHash:await hash(password),totpSecret:secret,requireTotp:true};
config.database.urlFile='/fixture/private/database-url';
config.providerSecrets.masterEncryptionKeyFile='/fixture/private/provider-key';
config.storage.root='/fixture/data/uploads';config.storage.temp='/fixture/data/temp';
config.logging.directory='/fixture/data/logs';
await writeFile('/fixture/private/config.yaml',stringify(config),{mode:0o600});
await writeFile('/fixture/private/postgres-password',dbPassword,{mode:0o600});
await writeFile('/fixture/private/database-url',`postgresql://modelnaru_test:${dbPassword}@postgres:5432/modelnaru_test`,{mode:0o600});
await writeFile('/fixture/private/provider-key',randomBytes(32).toString('base64url'),{mode:0o600});
await writeFile('/fixture/private/acceptance-credentials.json',JSON.stringify({username:'n13admin',password,totpSecret:secret}),{mode:0o600});
'''
user = str(os.getuid()) + ':' + str(os.getgid())
run(['docker', 'run', '--rm', '--network', 'none', '--user', user,
     '-e', 'N13_TRUST_SUBNET='+subnet, '-v', str(ROOT)+':/fixture',
     '--entrypoint', 'node', api_image, '--input-type=module', '-e', init])
containers = []


def launch(role, image, options, command=(), network=None):
    name = NAME + '-' + role
    run(['docker', 'run', '-d', '--name', name, '--network', network or frontend,
         '--log-opt', 'max-size=10m', '--log-opt', 'max-file=3', *options, image, *command])
    containers.append(name)
    return name


db = launch('postgres', 'postgres:17-alpine', [
    '--network-alias', 'postgres', '--cpus', '0.5', '--memory', '256m',
    '-e', 'POSTGRES_DB=modelnaru_test', '-e', 'POSTGRES_USER=modelnaru_test',
    '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/password',
    '-v', str(ROOT/'private/postgres-password')+':/run/secrets/password:ro',
    '-v', str(ROOT/'data/postgres')+':/var/lib/postgresql/data',
    '--health-cmd', 'pg_isready -U modelnaru_test -d modelnaru_test',
    '--health-interval', '2s', '--health-retries', '30'], network=backend)
ready(db)
run(['docker', 'run', '--rm', '--network', backend, '--user', user, '--cpus', '0.5', '--memory', '256m',
     '-e', 'APICHAT_CONFIG_FILE=/fixture/private/config.yaml', '-v', str(ROOT)+':/fixture', api_image,
     'node', '/workspace/packages/database/dist/migrate.js'])
api = launch('api', api_image, ['--network-alias', 'api', '--user', user, '--cpus', '0.75', '--memory', '768m',
    '-e', 'APICHAT_CONFIG_FILE=/fixture/private/config.yaml', '-v', str(ROOT/'private')+':/fixture/private:ro',
    '-v', str(ROOT/'data')+':/fixture/data', '--health-cmd',
    "node -e \"fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
    '--health-interval', '2s', '--health-retries', '30'], network=backend)
run(['docker', 'network', 'connect', '--alias', 'api', frontend, api])
ready(api)
web = launch('web', NAME+'-web', ['--network-alias', 'web', '--cpus', '0.5', '--memory', '512m',
    '--health-cmd', "node -e \"fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
    '--health-interval', '2s', '--health-retries', '30'])
ready(web)
gateway = launch('gateway', 'nginx:1.28-alpine', ['--cpus', '0.25', '--memory', '128m',
    '-p', '127.0.0.1::8080', '-v', str(ROOT/'deploy/gateway.conf')+':/etc/nginx/conf.d/default.conf:ro'])
port = int(run(['docker', 'port', gateway, '8080']).rsplit(':',1)[1])
state = {'root': str(ROOT), 'name': NAME, 'containers': containers, 'networks': [frontend,backend],
         'images': [NAME+'-api',NAME+'-web'], 'loopbackPort': port, 'webDomain': 'test-chat.mihoservice.xyz',
         'publicHttpsReady': False, 'lockSha256': LOCK, 'paidCalls': 0,
         'credentialsFile': str(ROOT/'private/acceptance-credentials.json')}
(ROOT/'state.json').write_text(json.dumps(state,indent=2))
print(json.dumps({k:v for k,v in state.items() if k!='credentialsFile'}),flush=True)
