# Gateway deploy (Inventory UI + nginx)

## URLs

| URL | Serves |
|-----|--------|
| `https://www.katariastoneworld.com/` | Redirect → `/inventory/` |
| `https://www.katariastoneworld.com/inventory/` | React app (static) |
| `https://www.katariastoneworld.com/api/*` | Proxied to Spring Boot API |
| `https://www.katariastoneworld.com/health` | Gateway liveness (`ok`) |

The React build is **intentionally** under `/inventory/` (see `package.json` → `"homepage": "/inventory"`).
Nginx maps that correctly:

```text
/usr/share/nginx/html/inventory/index.html   ← app entry
```

Visiting `/` does **not** look for `/usr/share/nginx/html/index.html`; it redirects to `/inventory/`.

## Railway — gateway service variables

### Build variable
```env
REACT_APP_API_URL=https://www.katariastoneworld.com
```
Browser calls `https://www.katariastoneworld.com/api/...` (same host, proxied to backend).

### Runtime variable (required)
```env
BACKEND_URL=http://api.railway.internal:8080
```
Replace `api` with your backend service name.

Or use the public API host:
```env
BACKEND_URL=https://api.katariastoneworld.com
```

**Without `BACKEND_URL`, the container refuses to start** (prevents nginx `proxy_pass` misconfiguration and 502 on every path).

## Verify after deploy

```text
GET https://www.katariastoneworld.com/health          → ok
GET https://www.katariastoneworld.com/inventory/    → React login page
GET https://www.katariastoneworld.com/api/auth/login → API (POST from UI)
```

## 502 troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| 502 on `/inventory/` | Container not running; check Railway logs | Set `BACKEND_URL`; redeploy |
| 502 on `/api/*` only | `BACKEND_URL` wrong or API down | Fix URL; check API `/actuator/health` |
| 502 on `/` | Custom domain on wrong service | Attach `www` to **gateway**, not API |
| App loads but API fails | CORS or wrong `REACT_APP_API_URL` | Use `https://www.katariastoneworld.com` at build time |

## Local smoke test

```bash
docker compose -f deploy/gateway/docker-compose.yml up --build
```

Open `http://localhost:8080/inventory/` (API must run on host port 8080).
