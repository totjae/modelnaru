#!/usr/bin/env bash
# Only the completed N13 fixture, never the production ModelNaru project.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run with sudo on mihoservice_server.'; exit 1; }
fixture_root=$(realpath -- "${1:?Pass /tmp/modelnaru-n13-server-naRXQ0}")
test "$fixture_root" = /tmp/modelnaru-n13-server-naRXQ0
test "$(dirname "$fixture_root")" = /tmp
port=$(python3 - "$fixture_root/state.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
n='modelnaru-n13-server-narxq0'
assert s['root']=='/tmp/modelnaru-n13-server-naRXQ0' and s['name']==n
assert set(s['containers'])=={n+'-'+x for x in ['api','web','postgres','gateway','mobile']}
assert set(s['networks'])=={n+'-frontend',n+'-backend'}
assert set(s['images'])=={n+'-api',n+'-web'}
assert s['webDomain']=='test-chat.mihoservice.xyz'
assert isinstance(s['loopbackPort'],int) and 1024<=s['loopbackPort']<=65535
print(s['loopbackPort'])
PY
)
site=/etc/nginx/sites-available/modelnaru-n13-test
enabled=/etc/nginx/sites-enabled/modelnaru-n13-test
if test -e "$site"; then
  grep -Fq 'server_name test-chat.mihoservice.xyz;' "$site"
  grep -Fq "proxy_pass http://127.0.0.1:$port;" "$site"
fi
if test -L "$enabled"; then
  test "$(readlink -f -- "$enabled")" = "$site"
  unlink "$enabled"
  if ! nginx -t; then
    ln -s "$site" "$enabled"
    echo 'Nginx validation failed; restored the fixture site link.'
    exit 1
  fi
  systemctl reload nginx
else
  test ! -e "$enabled"
fi
rm -f -- "$site"
if test -d /etc/letsencrypt/live/test-chat.mihoservice.xyz; then
  certbot delete --non-interactive --cert-name test-chat.mihoservice.xyz
fi
rm -rf -- /var/www/modelnaru-n13-acme
for service in gateway web api mobile postgres; do
  name="modelnaru-n13-server-narxq0-$service"
  if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name"; fi
done
for network in frontend backend; do
  name="modelnaru-n13-server-narxq0-$network"
  if docker network inspect "$name" >/dev/null 2>&1; then docker network rm "$name"; fi
done
for image in api web; do
  name="modelnaru-n13-server-narxq0-$image"
  if docker image inspect "$name" >/dev/null 2>&1; then docker image rm "$name"; fi
done
# The exact resolved root was checked before any recursive removal.
rm -rf -- "$fixture_root"
nginx -t
echo 'N13 fixture removed; production containers were not modified.'
docker ps --filter name='^modelnaru-' --format '{{.Names}} {{.Status}}'
