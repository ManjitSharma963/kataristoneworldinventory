# www.katariastoneworld.com — UI setup

## Architecture (what you want)

| URL | Role |
|-----|------|
| `https://www.katariastoneworld.com/inventory/` | React UI (this gateway service) |
| `https://api.katariastoneworld.com/api/...` | Spring Boot API + database |

The UI is built with `REACT_APP_API_URL=https://api.katariastoneworld.com` so the browser fetches data from the API domain.

## Railway: two separate services

1. **Backend** — repo `katariastoneworldbackend` → domain `api.katariastoneworld.com`
2. **Gateway (UI)** — repo `kataristoneworldinventory` → domain `www.katariastoneworld.com`

## Fix 502 on www (required in Railway dashboard)

The Docker image works locally. A 502 on `/health` means Railway’s edge **cannot reach the container** — not a React or API bug.

### Step A — Gateway service → Settings → Networking

1. Open the **inventory** service (Dockerfile: `deploy/gateway/Dockerfile`)
2. **Public Networking** → copy the current `*.up.railway.app` URL
3. Set **Target Port** to **Auto** (recommended)
4. Do **not** set a manual Target Port of `80` or `3000` unless it matches deploy logs

### Step B — Variables (gateway service)

**Delete** empty variables if present:
- `PORT=`
- `BACKEND_URL=`

Optional build variable (also in `railway.toml`):
```env
REACT_APP_API_URL=https://api.katariastoneworld.com
```

### Step C — Custom domain

1. Remove `www.katariastoneworld.com` from **any other** Railway service
2. Add it **only** on the gateway (inventory) service
3. Update DNS CNAME to the hostname Railway shows (not an old `*.up.railway.app` that returns 404)

Check DNS:
```bash
nslookup www.katariastoneworld.com
```

### Step D — Deploy and test in order

```bash
# 1) Railway default URL first
curl.exe -s https://YOUR-SERVICE.up.railway.app/health
# expect: ok

curl.exe -sI https://YOUR-SERVICE.up.railway.app/inventory/
# expect: 200

# 2) Then www
curl.exe -s https://www.katariastoneworld.com/health
curl.exe -sI https://www.katariastoneworld.com/inventory/
```

Deploy logs should show:
```text
[gateway] listening on http://0.0.0.0:8080
[gateway] health self-test passed
```

## Backend CORS

API must allow the UI origin. In backend Railway variables (optional override):
```env
CORS_ALLOWED_ORIGINS=https://www.katariastoneworld.com,https://katariastoneworld.com
```

Default in `application-prod.properties` already includes `www`.

## Do not use api.katariastoneworld.com/inventory for production UI

That was a temporary workaround. Production UI URL is **www** only.
