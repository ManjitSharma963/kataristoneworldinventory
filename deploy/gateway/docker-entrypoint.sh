#!/bin/sh
set -e

: "${PORT:=8080}"
: "${BACKEND_URL:=https://api.katariastoneworld.com}"

export PORT BACKEND_URL

echo "[gateway] PORT=$PORT"
echo "[gateway] BACKEND_URL=$BACKEND_URL"

if [ ! -f /usr/share/nginx/html/inventory/index.html ]; then
  echo "[gateway] ERROR: /usr/share/nginx/html/inventory/index.html is missing."
  echo "[gateway] The React build must be copied to html/inventory/ (see Dockerfile)."
  exit 1
fi

envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
