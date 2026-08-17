# Environment variables

Two apps, deployed separately. Set the **backend** up first (Railway), copy its
public URL, then set the **frontend** (Vercel) to point at it.

---

## Backend — Railway

Add these in your Railway **service → Variables** tab.

| Key | Value | Required | Notes |
|-----|-------|----------|-------|
| `PORT` | *(do not set)* | ❌ | Railway injects this automatically; the server reads `process.env.PORT`. |
| `CORS_ORIGIN` | `https://your-app.vercel.app` | ⚪ Optional | Locks CORS to your frontend. Comma-separate multiple origins. Defaults to `*` (allow all) if unset. |
| `NODE_ENV` | `production` | ⚪ Optional | — |

> The backend boots with **zero** variables set (uses `*` CORS + the auto `PORT`).
> `CORS_ORIGIN` is only to tighten access once you know the Vercel domain.

**Also required in the service Settings (not a variable):**
`Root Directory = backend`

---

## Frontend — Vercel

Add this in your Vercel **Project → Settings → Environment Variables**.

| Key | Value | Required | Notes |
|-----|-------|----------|-------|
| `VITE_API_URL` | `https://your-backend.up.railway.app` | ✅ Yes | Your Railway public URL. **No trailing slash, no `/api`** — the app appends `/api` itself. Falls back to `http://localhost:5000` if unset. |

> ⚠️ `VITE_*` values are baked in at **build time**. If you add or change
> `VITE_API_URL` after a deploy, you must **redeploy** the frontend for it to take effect.

**Also required in Project Settings (not a variable):**
`Root Directory = frontend`

---

## Copy-paste

**Railway (backend):**
```
CORS_ORIGIN=https://your-app.vercel.app
```

**Vercel (frontend):**
```
VITE_API_URL=https://your-backend.up.railway.app
```

Replace both URLs with your real deployment URLs.
