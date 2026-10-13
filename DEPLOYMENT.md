# One Railway app service

Frontend and backend deploy together from the repository root. PostgreSQL can be external or an existing Railway database service; it is not bundled into the app container.

1. Connect `imekrrish/tender-dashboard` to one Railway application service.
2. Select branch `feat/procurement-radar-db` to test PR #1, or `main` after merging the PR.
3. Set **Root Directory** to `/` (repository root), not `backend` or `frontend`.
4. Use **Config File Path** `/railway.json`. Clear old dashboard build/start/pre-deploy overrides. The repository config selects:
   - Builder: Dockerfile (`Dockerfile` at repository root).
   - Pre-deploy: `npm run deploy:prepare` (migrate, then seed).
   - Start: `npm start`.
   - Health check: `/api/radar/health`.
5. Add variables from `ENV.md`: `DATABASE_URL`, `ADMIN_API_KEY`, `NODE_ENV=production`, and `TENDER_SEED_BASE64` for automatic data loading.. Railway injects `PORT`; the server listens on `0.0.0.0` at that port.
6. Deploy, then **Networking → Generate Domain**. Let Railway use the application's `PORT` as the target port.
7. Open `/` for the dashboard and `/api/radar/health` for the database check. Successful readiness returns `{"status":"OK","source":"PostgreSQL"}`.

Docker builds Vite in a separate build stage; the final runtime contains only production backend dependencies and the compiled frontend. API routes run before static files; unknown `/api` paths return JSON 404 errors. SPA deep links serve index.html; missing assets return 404. Hashed assets are cached, while index.html is revalidated.

An unconfigured or unreachable DB makes migration/health fail. The migration targets a new database; if the supplied DB already contains the specification tables, reconcile the schema before migration 001. No production DB has been connected or Railway deployment performed yet.

Legacy auction / price-index Excel uploads remain ephemeral across redeploys unless durable storage is added. Procurement tender data persists in PostgreSQL.

## Local checks

Use Node 22 or newer:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run build
npm test
```

Set backend environment variables in your shell. Run `npm run migrate`, then `npm start` from the repository root to serve the built application on `http://localhost:5000`. For frontend development, run `npm run dev` in `frontend/`; its Vite proxy forwards `/api` to port 5000.

## Automatic seed

Set `TENDER_SEED_BASE64` to the privately provided gzip/base64 JSON bundle. The pre-deploy script seeds after migrations and before the app starts. First import inserts the batch atomically; exact repeats skip it. A failure stops deployment and leaves the import transaction rolled back. Conflicting pre-existing records require reconciliation rather than being silently overwritten. If the seed variable is absent, migrations still run and seeding is skipped.
