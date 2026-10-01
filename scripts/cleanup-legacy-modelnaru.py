#!/usr/bin/env python3
"""One-time, user-authorized cleanup after the 2026-10-02 Git reinstall.

Dry run by default. Run as root with --execute only after the new release is
healthy. Deletes only the literal old ModelNaru resources listed below.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

NEW = Path('/home/totquf4171/modelnaru-git')
ROOTS = [Path('/home/totquf4171/modelnaru'),
         Path('/home/totquf4171/modelnaru-v2-20261002'),
         Path('/home/totquf4171/.modelnaru-n04-test')]
CONTAINERS = [f'{project}-{service}-1'
              for project, services in [
                  ('modelnaru', ['gateway', 'api', 'web', 'migrate', 'postgres', 'valkey']),
                  ('modelnaru-v2', ['gateway', 'api', 'web', 'migrate', 'postgres'])]
              for service in services] + ['modelnaru-n04-postgres-test']
NETWORKS = ['modelnaru_frontend', 'modelnaru_backend',
            'modelnaru-v2_frontend', 'modelnaru-v2_backend']
VOLUMES = ['modelnaru_n04_test_data']
IMAGES = [f'{p}-{s}:latest' for p in ['modelnaru', 'modelnaru-v2']
          for s in ['api', 'web', 'migrate', 'admin-tool']]
IMAGES += ['modelnaru-rollback-20261002-api:latest',
           'modelnaru-rollback-20261002-web:latest']


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args[:3]))
    return result.stdout.strip()


def under(value, root):
    return value == root or root in value.parents


def main():
    if sys.argv[1:] not in ([], ['--execute']):
        raise RuntimeError('Use no argument for preview, or --execute')
    execute = sys.argv[1:] == ['--execute']
    if execute and os.geteuid() != 0:
        raise RuntimeError('Root required to remove the old PostgreSQL files')
    if not (NEW / '.git').is_dir() or NEW.resolve() != NEW:
        raise RuntimeError('New Git checkout missing or redirected')
    state = json.loads((NEW / 'deployment-state.json').read_text())
    if not state.get('cutoverVerified'):
        raise RuntimeError('New release cutover has not been verified')
    for service in ['api', 'web', 'gateway', 'postgres']:
        name = 'modelnaru-git-' + service + '-1'
        if run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name]) != 'healthy':
            raise RuntimeError('New service not healthy: ' + service)
    run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
         '--resolve', 'chat.mihoservice.xyz:443:127.0.0.1',
         'https://chat.mihoservice.xyz/api/health/ready'])
    for root in ROOTS:
        if root.is_symlink() or root.resolve() != root or under(NEW, root):
            raise RuntimeError('Unsafe old directory: ' + str(root))
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        mount = Path(line.split()[4])
        if any(under(mount, root) for root in ROOTS):
            raise RuntimeError('Old directory contains a host mount')
    ids = run(['docker', 'ps', '-aq']).splitlines()
    inspected = json.loads(run(['docker', 'inspect', *ids])) if ids else []
    for container in inspected:
        name = container['Name'].lstrip('/')
        if name in CONTAINERS:
            project = container.get('Config', {}).get('Labels', {}) or {}
            if name != 'modelnaru-n04-postgres-test' and project.get('com.docker.compose.project') not in ['modelnaru', 'modelnaru-v2']:
                raise RuntimeError('Old container ownership mismatch: ' + name)
            continue
        for mount in container.get('Mounts', []):
            source = Path(mount.get('Source', '/'))
            if any(under(source, root) for root in ROOTS) or mount.get('Name') in VOLUMES:
                raise RuntimeError('Another container uses old data: ' + name)
    print(json.dumps({'directories': [str(p) for p in ROOTS],
                      'containers': CONTAINERS, 'networks': NETWORKS,
                      'volumes': VOLUMES, 'imageTags': IMAGES,
                      'execute': execute}, indent=2))
    if not execute:
        return
    names = {i['Name'].lstrip('/') for i in inspected}
    for name in CONTAINERS:
        if name in names:
            run(['docker', 'rm', '-f', name])
    for kind, values in [('network', NETWORKS), ('volume', VOLUMES)]:
        existing = set(run(['docker', kind, 'ls', '--format', '{{.Name}}']).splitlines())
        for value in values:
            if value in existing:
                run(['docker', kind, 'rm', value])
    tags = set(run(['docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']).splitlines())
    for tag in IMAGES:
        if tag in tags:
            run(['docker', 'image', 'rm', tag])
    for root in ROOTS:
        if root.exists():
            shutil.rmtree(root)
    state['legacyCleanupComplete'] = True
    target = NEW / 'deployment-state.json'
    target.write_text(json.dumps(state, indent=2) + '\n')
    os.chown(target, (NEW / '.git').stat().st_uid, (NEW / '.git').stat().st_gid)
    print('PASS: old ModelNaru data/backups removed; new checkout and host HTTPS retained')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
