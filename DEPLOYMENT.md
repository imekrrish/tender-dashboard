# Deployment guide

Monorepo with two independently deployed apps:

| App | Folder | Host | Start |
|-----|--------|------|-------|
| Frontend (Vite + React) | `frontend/` | **Vercel** | static build |
| Backend (Express API) | `backend/` | **Railway** | `npm start` |

Deploy the **backend first** so you have its public URL for the frontend env var.

---

## 1. Backend → Railway

1. Push this repo to GitHub (see [Git setup](#git-setup) below).
2. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
3. In the service **Settings**:
   - **Root Directory:** `backend`
   - Start command is auto-detected from `railway.json` (`npm start`); Node ≥ 18 from `package.json` engines.
   - Railway injects `PORT` automatically — the server already reads `process.env.PORT`.
4. (Optional, recommended) **Variables** → add `CORS_ORIGIN` = your Vercel URL
   once you have it, e.g. `https://tender-dashboard.vercel.app`. Comma-separate
   multiple origins. Leave unset to allow all origins.
5. Deploy. Confirm health: open `https://<your-app>.up.railway.app/api/health`
   → should return `{"status":"OK",...}`.
6. Copy the public URL — you'll need it for the frontend.

> **Note on uploads:** Railway's filesystem is ephemeral. An uploaded workbook
> lives only until the next restart/redeploy, after which the app falls back to
> the bundled default database (`backend/src/data/…xlsx`). For permanent uploads,
> attach a Railway Volume mounted at `backend/uploads` (or move storage to a
> bucket/DB) — not required for the demo.

## 2. Frontend → Vercel

1. Vercel → **Add New → Project** → import this GitHub repo.
2. **Root Directory:** `frontend` (Framework preset auto-detects **Vite**;
   build `npm run build`, output `dist` — also pinned in `vercel.json`).
3. **Environment Variables** → add:
   - `VITE_API_URL` = your Railway URL from step 1 (no trailing slash, no `/api`),
     e.g. `https://tender-dashboard-backend.up.railway.app`
4. Deploy. The SPA rewrite in `vercel.json` handles deep links.
5. If you set `CORS_ORIGIN` on Railway, make sure it matches the final Vercel
   domain, then redeploy the backend.

---

## Local development

```bash
# terminal 1 — backend (http://localhost:5000)
cd backend && npm install && npm run dev

# terminal 2 — frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

The frontend defaults to `http://localhost:5000` when `VITE_API_URL` is unset,
so no local env file is needed. To point local dev at a remote API, create
`frontend/.env.local` with `VITE_API_URL=…` (see `frontend/.env.example`).

## Git setup

This project is not yet a git repo. To deploy via GitHub:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`node_modules/`, `dist/`, and `backend/uploads/` are git-ignored.
