#!/bin/sh
set -e

# Do NOT default PORT — Railway injects PORT at runtime. Wrong port = 502.
if [ -z "${PORT:-}" ]; then
  echo "[gateway] FATAL: PORT is not set. Railway must inject PORT at runtime."
  echo "[gateway] Do not set PORT=8080 in Dockerfile; remove any empty PORT variable in Railway."
  exit 1
fi

if [ -z "${BACKEND_URL:-}" ]; then
  BACKEND_URL="https://api.katariastoneworld.com"
fi

export PORT BACKEND_URL

echo "[gateway] starting nginx gateway"
echo "[gateway] PORT=${PORT} (nginx must listen on this exact port)"
echo "[gateway] BACKEND_URL=${BACKEND_URL}"

if [ ! -f /usr/share/nginx/html/inventory/index.html ]; then
  echo "[gateway] FATAL: missing /usr/share/nginx/html/inventory/index.html"
  exit 1
fi

envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

echo "[gateway] validating nginx config..."
nginx -t -c /tmp/nginx.conf 2>&1

echo "[gateway] nginx config ok — binding to 0.0.0.0:${PORT}"
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
