const express = require('express');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PORT) || 8080;
const STATIC_DIR = path.join(__dirname, 'public');
const INVENTORY_DIR = path.join(STATIC_DIR, 'inventory');

const app = express();

console.log(`[gateway] UI host: www.katariastoneworld.com/inventory/`);
console.log(`[gateway] API host: https://api.katariastoneworld.com (called by browser from React build)`);
console.log(`[gateway] PORT=${PORT}`);
console.log(`[gateway] static=${INVENTORY_DIR}`);

app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.get('/', (_req, res) => res.redirect(302, '/inventory/'));

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
        if (body !== 'ok') {
          console.error(`[gateway] FATAL: health self-test failed: ${body}`);
          process.exit(1);
        }
        console.log('[gateway] health self-test passed');
      });
    })
    .on('error', (err) => {
      console.error('[gateway] FATAL:', err.message);
      process.exit(1);
    });
});
