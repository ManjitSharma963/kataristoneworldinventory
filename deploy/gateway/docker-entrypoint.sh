#!/bin/sh
set -e

# Railway may inject PORT; default only when unset (not when empty).
if [ -z "${PORT:-}" ]; then
  PORT=8080
fi

# Empty BACKEND_URL in Railway Variables overrides Dockerfile ENV — treat as unset.
if [ -z "${BACKEND_URL:-}" ]; then
  BACKEND_URL="https://api.katariastoneworld.com"
fi

export PORT BACKEND_URL

echo "[gateway] starting nginx gateway"
echo "[gateway] PORT=${PORT}"
echo "[gateway] BACKEND_URL=${BACKEND_URL}"

if [ ! -f /usr/share/nginx/html/inventory/index.html ]; then
  echo "[gateway] FATAL: missing /usr/share/nginx/html/inventory/index.html"
  ls -la /usr/share/nginx/html/ 2>/dev/null || true
  ls -la /usr/share/nginx/html/inventory/ 2>/dev/null || true
  exit 1
fi

envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

echo "[gateway] validating nginx config..."
nginx -t -c /tmp/nginx.conf

echo "[gateway] nginx config ok, listening on 0.0.0.0:${PORT}"
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
