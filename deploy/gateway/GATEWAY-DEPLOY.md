# Gateway deploy (Inventory UI + nginx)

## Diagnosis (curl results)

| URL | Result | Meaning |
|-----|--------|---------|
| `*.up.railway.app` → 404 "Application not found" | Service URL invalid or no active deployment |
| `www.katariastoneworld.com` → 502 "Application failed to respond" | Domain points to a service whose container is not responding |

The React files under `/usr/share/nginx/html/inventory/` are **correct**. Nginx already redirects `/` → `/inventory/`.

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
