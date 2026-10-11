# Procurement Radar

The tender dashboard now reads PostgreSQL through `/api/radar`. It does not read Excel or substitute sample bids. The Price Index and legacy auction endpoints remain separate.

## Run locally

Use Node 22 or later. Set the backend variables from `backend/.env.example` in your shell, then run:

```sh
cd backend
npm ci
npm run migrate
npm start
```

In another terminal, set `VITE_API_URL=http://localhost:5000`, then run `npm ci` and `npm run dev` in `frontend/`. Environment example files are documentation; the server reads environment variables and does not load `.env` automatically.

## Database and administration

`src/db/001_procurement.sql` implements the supplied specification with master regions, countries, products, scopes, authorities, tenders, eligibility, documents and corrigenda. Phase 2 tables for market players, auctions and bidder results are created for later reporting; their analytics and admin UI are not implemented. Countries require a region and child tender records require a parent tender so records cannot silently disappear from joins.

Run `npm run migrate` once against a new database. Version tracking, a transaction and an advisory lock prevent duplicate migration execution. Existing databases that already contain these table names need a schema reconciliation before applying migration 001.

Admin access uses a server-configured bearer key entered in the UI and retained in React memory only. It is a shared administrator credential, not individual user accounts. Create catalogs first: regions → countries → products / scopes → authorities → tenders → eligibility / documents / corrigenda. Delete operations ask for confirmation; referenced catalogs cannot be deleted. Audit timestamps are server-controlled; editor attribution currently uses `admin`.

Public reads exclude Draft tenders. Dashboard filtering and CSV export default to Open, use the same SQL conditions and sort by due date. KPI totals cover the entire filtered dataset, not just the displayed page. Pure BESS product code must be `BESS` to exclude its MW rating from solar totals. Expiring bids must be Open or Under Pre-Bid, not expired, and due strictly within the next 14 days. Deadlines display in the viewer's local timezone with a timezone label.

## Railway preparation

Use `backend` as the Railway service root. Configure `DATABASE_URL`, `ADMIN_API_KEY` and `CORS_ORIGIN`. `railway.json` runs the migration before deployment and checks `/api/radar/health`, which verifies database access. No deployment has been performed by this change.

Frontend deployment remains the existing Vite workflow; set `VITE_API_URL` to the backend origin before building. Database credentials must never be added to `VITE_*` variables.

## Pending source inputs

- Original `Tenders New Design 5.html` has been reviewed: product multi-select checkboxes, the right-hand intelligence drawer, header bid count and resource-specific master columns are implemented with database values. The prototype’s hardcoded sample records and KPI values are not used.
- Tender Zen reference (`https://www.tenderzen.de/en`) has been reviewed for layout inspiration. The UI uses soft surfaces, clear typography, more spacing and distinct TaiyangNews teal accents. Exact Futurescope URL/screenshots are still pending. No Tender Zen AI agent features or marketing content are implied by this styling reference.
- Udaya's Excel: will be used for a one-time mapped database import, not as the live data source. Import column mappings and deduplication must be checked against the actual workbook.
- Production DB URL: needed for real PostgreSQL integration verification and deployment.
- Document storage: individual HTTP(S) document links are supported. Uploads, private bucket signing and ZIP downloads await bucket/access details and are not yet implemented.
- Charts: await the supplied charts; current KPIs use database totals. Phase 2 tariff benchmarking and multi-winner reporting are future work.
- Corrigenda can be recorded separately. Update the tender's close date as part of publishing an extension; recording a corrigendum alone does not overwrite it automatically.

## Verification

`npm test` in `backend` tests validation, parameter binding, CSV formula escaping, schema relations and HTTP catalog CRUD/authentication using pg-mem. `npm run build` in `frontend` type-checks and builds the app. These checks do not replace testing against the provided production PostgreSQL or browser layout verification.
