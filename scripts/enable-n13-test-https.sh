#!/usr/bin/env bash
# Run by the server administrator after reviewing the private test state.
# Creates only the dedicated test-chat site; no production site files are edited.
set -eu
test "$(id -u)" = 0 || { echo 'Run with sudo on mihoservice_server.'; exit 1; }
fixture_root=$(realpath -- "${1:?Pass the prepared /tmp/modelnaru-n13-server-* directory}")
case "$fixture_root" in /tmp/modelnaru-n13-server-*) ;; *) exit 1 ;; esac
test "$(dirname "$fixture_root")" = /tmp
domain=test-chat.mihoservice.xyz
site=/etc/nginx/sites-available/modelnaru-n13-test
enabled=/etc/nginx/sites-enabled/modelnaru-n13-test
acme=/var/www/modelnaru-n13-acme
test ! -e "$site" && test ! -e "$enabled" && test ! -L "$enabled"
test ! -e "/etc/letsencrypt/live/$domain"
port=$(python3 - "$fixture_root/state.json" <<'PY'
import json,sys
state=json.load(open(sys.argv[1]))
assert state['webDomain']=='test-chat.mihoservice.xyz'
port=state['loopbackPort']
assert isinstance(port,int) and 1024<=port<=65535
print(port)
PY
)
install -d -m 755 "$acme"
cat > "$site" <<EOF
server {
    listen 80;
    server_name $domain;
    access_log off;
    location ^~ /.well-known/acme-challenge/ { root $acme; }
    location / { return 404; }
}
EOF
chmod 644 "$site"
ln -s "$site" "$enabled"
if ! nginx -t; then
    rm -- "$enabled" "$site"
    exit 1
fi
systemctl reload nginx
# Reuses the server's existing ACME account; does not copy any private key.
certbot certonly --webroot -w "$acme" -d "$domain" --non-interactive --agree-tos
openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -checkhost "$domain"
openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -checkend 86400
cat > "$site" <<EOF
server {
    listen 80;
    server_name $domain;
    access_log off;
    location ^~ /.well-known/acme-challenge/ { root $acme; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $domain;
    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log off;
    error_log /var/log/nginx/modelnaru-n13-test.error.log warn;
    client_max_body_size 11m;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
EOF
nginx -t
systemctl reload nginx
echo "Test Web URL: https://$domain (same responsive Web for PC and phone)"
