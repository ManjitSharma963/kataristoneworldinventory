const express = require('express');
const path = require('path');
const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = Number(process.env.PORT) || 8080;
const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.katariastoneworld.com').replace(/\/$/, '');
const STATIC_DIR = path.join(__dirname, 'public');
const INVENTORY_DIR = path.join(STATIC_DIR, 'inventory');

const app = express();

console.log(`[gateway] PORT=${PORT}`);
console.log(`[gateway] BACKEND_URL=${BACKEND_URL}`);
console.log(`[gateway] serving static from ${INVENTORY_DIR}`);

const proxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  secure: true,
  on: {
    error(err, req, res) {
      console.error(`[proxy] error ${req.method} ${req.url}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Backend unreachable' }));
    },
  },
});

app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.get('/', (_req, res) => res.redirect(302, '/inventory/'));

app.use('/api', proxy);
app.use('/actuator', proxy);
app.use('/swagger-ui.html', proxy);
app.use('/api-docs', proxy);

app.use(
  '/inventory',
  express.static(INVENTORY_DIR, { index: 'index.html', redirect: false })
);

app.get(/^\/inventory(?:\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(INVENTORY_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[gateway] listening on http://0.0.0.0:${PORT}`);

  http
    .get(`http://127.0.0.1:${PORT}/health`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (body === 'ok') {
          console.log('[gateway] self-test passed');
          return;
        }
        console.error(`[gateway] FATAL: self-test failed, body=${body}`);
        process.exit(1);
      });
    })
    .on('error', (err) => {
      console.error('[gateway] FATAL: self-test error', err.message);
      process.exit(1);
    });
});
