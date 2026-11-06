# SECI extraction and reviewed import

In **Master Tables → Tenders**, sign in with the existing admin PIN. The SECI extraction panel accepts the SECI tender listing or an individual tender-detail URL. Default: the first 5 tenders as listed by SECI; maximum 25. The panel does not filter expired listings automatically: use a detail URL when you want a particular tender.

## Setup

1. Set `DATABASE_URL` and the existing `ADMIN_API_KEY` on the backend.
2. Set `OPENAI_API_KEY` as a server environment variable. Do not put it in the frontend or commit it. Optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`, which must be available to your API project and support structured Responses and PDF inputs.
3. Run `npm run migrate` before starting the updated server. Migration 004 adds extraction jobs, criterion records, and review audit batches without modifying existing eligibility data.
4. The Docker image installs `poppler-utils`. For local development install Poppler (`pdftotext` must be on PATH).
5. Run `npm start`. The server polls the PostgreSQL job queue every three seconds. No Redis is required. Missing API key disables extraction; existing dashboards and imports keep working.

## Workflow

1. Enter the SECI URL and choose the tender count. Start extraction and follow persisted job progress. Three active/queued jobs are permitted at once. Jobs process sequentially per server process; PostgreSQL claims avoid duplicate processing across instances.
2. Download `tenders-review.xlsx`, `technical-review.xlsx`, and `financial-review.xlsx`.
3. Each file includes its extraction ID and a Sources tab with document URLs, hashes, status, and review notes. Technical and financial workbooks contain one condition per row; general/legal/consortium conditions are retained in the technical workbook under `General`.
4. Correct the data, resolve amendments and AND/OR conditions, and mark accepted rows **Approved**. **Pending**, **Rejected**, and blank review statuses are skipped. Unknown values stay blank; required tender fields must be supplied before approval. Retain physical PDF page references, units, evidence, and full qualification conditions. Paste values rather than spreadsheet formulas.
5. Upload all three workbooks from the same extraction together (maximum 5 MB each). Preview reports new tenders, updates, field changes, approved eligibility count, and skipped rows. Nothing is inserted into tender tables during preview.
6. Confirm the import. The whole bundle commits in one transaction. Public tender inspection shows technical, financial, and general criteria separately, with links to their sources. The existing summary editor also has separate financial, technical, and general sections. Existing summary values are retained and are not automatically recalculated from narrative criteria.

Repeated confirmation or uploading exactly the same reviewed file contents does not duplicate records. Previews expire after 30 minutes. Changes to tender/criterion records after preview require a fresh upload. Original extraction results and reviewed payloads remain in PostgreSQL for audit. Corrections to an existing criterion must retain its Criterion ID. Omitted/rejected rows do not delete previously imported criteria; use the original reviewed row to correct a superseded condition. The original one-workbook imports remain available and unchanged.

## Processing and accuracy limits

- Only HTTPS SECI tender pages and `/uploads/tenders/` documents are fetched, with redirect validation. External portals requiring access, unsupported files, fetch failures, and missing conditions are flagged rather than guessed.
- Text PDFs are extracted by physical page and processed in bounded chunks. XLS/XLSX source documents are read as table text. For scanned PDFs a PDF-vision fallback is used up to 10 MB and 100 pages. Larger scans, sparse pages in mixed PDFs, and unsupported files are flagged for manual verification.
- Maximum: 25 MB per source, 500 pages per text PDF, 12 documents per tender, and 30 OpenAI calls per tender (override `SECI_MAX_CALLS_PER_TENDER` with an integer from 1–100). Reaching any processing limit marks the job partial, with the affected source identified. Larger jobs incur more API usage; start with a small count.
- A job has a one-hour processing deadline. Progress and heartbeat are persisted. A running job with no heartbeat for 15 minutes is marked failed; it is never silently retried after a server crash. Start a new extraction to retry.
- OpenAI transient 429/5xx responses are retried up to twice. Incomplete/refused model outputs are rejected. Text-extracted eligibility excerpts are checked against the referenced physical page. Vision-derived evidence requires manual verification.
- Date/title/reference fields come from HTML table labels where available; other metadata is AI extracted. Conflicting closing dates and identified amendments are flagged. The reviewer must resolve precedence before approval; the system does not make a bidder qualification decision.
- Eligibility IDs persist in the review workbooks. Later extraction jobs may phrase the same condition differently: reconcile their proposed conditions before importing again. Exact-file deduplication is not semantic deduplication across independently generated jobs.

## API

All routes are under `/api/radar/admin/seci` and require the existing bearer admin key:

- `GET /status`, `GET /jobs`, `POST /jobs` with `{url, limit}`, `GET /jobs/:id`
- `GET /jobs/:id/tenders.xlsx`, `/technical.xlsx`, `/financial.xlsx`
- `POST /review/preview`: multipart `tenders`, `technical`, `financial`
- `POST /review/:id/commit`: commits the stored preview, not client-supplied data

## Validation

Run `npm test` and `npm run build`. Agent tests cover source restrictions, HTML dates and amendments, partial failures, schema/refusal handling, workbook approval, source evidence, database relationships, import idempotency and rollback on stale previews. Tests use a mocked OpenAI endpoint and synthetic workbooks, never a real API key. Live paid model quality should be evaluated against a reviewer-checked sample before operational use.
