#!/bin/sh
set -eu

if [ -s /certs/ca.crt ] && [ -s /certs/server.crt ] && [ -s /certs/server.key ]; then
  exit 0
fi

cat >/tmp/server.ext <<'EOF'
subjectAltName=IP:127.0.0.1,DNS:localhost
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF

openssl req -x509 -newkey rsa:3072 -sha256 -days 7 -nodes \
  -subj "/CN=Ledgerly R5 Acceptance CA" \
  -keyout /certs/ca.key -out /certs/ca.crt
openssl req -newkey rsa:3072 -nodes -subj "/CN=localhost" \
  -keyout /certs/server.key -out /tmp/server.csr
openssl x509 -req -sha256 -days 7 -in /tmp/server.csr \
  -CA /certs/ca.crt -CAkey /certs/ca.key -CAcreateserial \
  -extfile /tmp/server.ext -out /certs/server.crt
chmod 600 /certs/ca.key /certs/server.key
