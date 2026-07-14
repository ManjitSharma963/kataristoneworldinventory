#!/bin/sh
set -e

# Railway injects PORT at runtime. Trim whitespace/quotes from dashboard variables.
PORT=$(printf '%s' "${PORT:-}" | tr -d ' \t\r\n"'"'"'')
if [ -z "$PORT" ]; then
  echo "[gateway] FATAL: PORT is not set. Railway must inject PORT at runtime."
  echo "[gateway] Remove any empty PORT variable in Railway Variables."
  exit 1
fi

BACKEND_URL=$(printf '%s' "${BACKEND_URL:-}" | tr -d ' \t\r\n"'"'"'')
if [ -z "$BACKEND_URL" ]; then
  BACKEND_URL="https://api.katariastoneworld.com"
fi

export PORT BACKEND_URL

echo "[gateway] starting nginx gateway"
echo "[gateway] PORT=${PORT} (Railway Target Port must match this)"
echo "[gateway] BACKEND_URL=${BACKEND_URL}"

if [ ! -f /usr/share/nginx/html/inventory/index.html ]; then
  echo "[gateway] FATAL: missing /usr/share/nginx/html/inventory/index.html"
  exit 1
fi

envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

echo "[gateway] validating nginx config..."
nginx -t -c /tmp/nginx.conf 2>&1

echo "[gateway] nginx config ok — binding to 0.0.0.0:${PORT}"

# Self-test before Railway healthcheck: fail deploy loudly if nginx cannot serve /health.
nginx -c /tmp/nginx.conf
sleep 1
if ! wget -qO- "http://127.0.0.1:${PORT}/health" | grep -q '^ok$'; then
  echo "[gateway] FATAL: self-test failed for http://127.0.0.1:${PORT}/health"
  nginx -s quit -c /tmp/nginx.conf 2>/dev/null || true
  exit 1
fi
echo "[gateway] self-test passed: http://127.0.0.1:${PORT}/health -> ok"
nginx -s quit -c /tmp/nginx.conf
sleep 1

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
