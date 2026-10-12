# Railway environment variables — combined frontend + backend

Set these on the single **application service**:

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Your PostgreSQL connection URL, or `${{Postgres.DATABASE_URL}}` when the database service is named `Postgres` | Yes |
| `ADMIN_API_KEY` | A unique long random secret; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Yes, to use admin CRUD |
| `NODE_ENV` | `production` | Set explicitly; also the Docker default |

Railway supplies `PORT`; do not set it manually. Do not set `VITE_API_URL` or `CORS_ORIGIN` for the combined service. Frontend requests use same-origin `/api`, so there are no frontend environment variables to configure. Remove any old `VITE_API_URL` values and stale build/start/root-directory overrides from the application service.

`CORS_ORIGIN` remains optional for a deliberately separate client, not this deployment. `ADMIN_API_KEY` is entered in the site's admin screen; it is never compiled into the frontend.

If using an external database, use its provider-approved PostgreSQL URL including required SSL options. The application does not disable certificate validation. No other database credentials or pool variables are required.
