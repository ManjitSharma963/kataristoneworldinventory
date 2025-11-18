// Proxy disabled - Using direct API calls to http://localhost:8080
// If you need to re-enable proxy, uncomment the code below

// const { createProxyMiddleware } = require('http-proxy-middleware');

// module.exports = function(app) {
//   console.log('[SETUP PROXY] Configuring proxy for /api -> http://localhost:8080/api');
//   
//   app.use(
//     '/api',
//     createProxyMiddleware({
//       target: 'http://localhost:8080',
//       changeOrigin: true,
//       secure: false,
//       logLevel: 'debug',
//       onProxyReq: (proxyReq, req, res) => {
//         console.log(`[PROXY] ${req.method} ${req.url} -> http://localhost:8080${req.url}`);
//       },
//       onProxyRes: (proxyRes, req, res) => {
//         console.log(`[PROXY] Response ${proxyRes.statusCode} for ${req.url}`);
//       },
//       onError: (err, req, res) => {
//         console.error('[PROXY ERROR]', err.message);
//         console.error('[PROXY ERROR] Stack:', err.stack);
//         if (!res.headersSent) {
//           res.status(500).json({ error: 'Proxy error', message: err.message });
//         }
//       }
//     })
//   );
//   
//   console.log('[SETUP PROXY] Proxy configured successfully');
// };

// Export empty function to prevent errors
module.exports = function(app) {
  // Proxy disabled - no action needed
};
