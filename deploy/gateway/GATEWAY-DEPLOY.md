# Gateway deploy (Inventory UI + nginx)

## Diagnosis (curl results)

| URL | Result | Meaning |
|-----|--------|---------|
| `*.up.railway.app` → 404 "Application not found" | Service URL invalid or no active deployment |
| `*.up.railway.app` → 502 + `x-railway-fallback: true` | Service exists but Railway edge **cannot reach the container port** |
| `www.katariastoneworld.com` → 502 "Application failed to respond" | Target port mismatch, crashed container, or domain attached to wrong/dead service |

**502 on `/health` proves this is NOT a backend/proxy issue.** Gateway `/health` is served by nginx only (`return 200 'ok'`). If that returns 502, nginx is not reachable from Railway's edge.

The React files under `/usr/share/nginx/html/inventory/` are **correct**. Nginx already redirects `/` → `/inventory/`.

## Fix 502 in Railway (most common)

Your deploy logs can show nginx started on `PORT=8080` while public requests still return 502. That is a **Networking target port mismatch**.

1. Open **gateway** service (inventory repo) → **Settings** → **Networking**
2. Under **Public Networking**, note the current `*.up.railway.app` URL
3. Set **Target Port** to **`$PORT`** or **Auto** (recommended). If you must set a number, it must match deploy logs, e.g. `8080`
4. **Delete** any manual `PORT` variable unless you know the exact value Railway should use
5. **Delete** any empty `BACKEND_URL` variable (empty overrides the Dockerfile default)
6. **Custom domain** `www.katariastoneworld.com` must be on the **gateway** service only (API uses `api.katariastoneworld.com`)
7. If DNS CNAME points to an old `*.up.railway.app` that returns 404, remove and re-add the custom domain on the live gateway service
8. Redeploy, then test the **current** `*.up.railway.app/health` before testing `www`

## Railway gateway variables

```env
BACKEND_URL=https://api.katariastoneworld.com
```

**Delete** any empty `BACKEND_URL` variable in Railway — an empty value overrides the Dockerfile default and breaks nginx.

Optional (private networking):
```env
BACKEND_URL=http://api.railway.internal:8080
```

Build variable:
```env
REACT_APP_API_URL=https://www.katariastoneworld.com
```

## After push — verify

1. Railway → gateway service → **Deployments** → latest deploy logs should show:
   ```text
   [gateway] starting nginx gateway
   [gateway] PORT=...
   [gateway] BACKEND_URL=https://api.katariastoneworld.com
   [gateway] nginx config ok, listening on 0.0.0.0:...
   ```
2. Copy the **current** `*.up.railway.app` URL from Railway → Settings → Networking (old URLs 404 after redeploy/rename).
3. Test:
   ```bash
   curl -I https://<your-service>.up.railway.app/health
   curl -I https://<your-service>.up.railway.app/inventory/
   curl -I https://www.katariastoneworld.com/inventory/
   ```

## Custom domain

Attach `www.katariastoneworld.com` only to the **gateway** service (not the API).
