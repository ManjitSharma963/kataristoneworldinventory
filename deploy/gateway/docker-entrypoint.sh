#!/bin/sh
set -e

: "${PORT:=8080}"
: "${BACKEND_URL:=http://host.docker.internal:8080}"

export PORT BACKEND_URL

echo "[gateway] PORT=$PORT"
echo "[gateway] BACKEND_URL=$BACKEND_URL"

envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
