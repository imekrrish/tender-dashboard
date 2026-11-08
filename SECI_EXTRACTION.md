# SECI extraction and reviewed import

In **Master Tables → Tenders**, sign in with the existing admin PIN. The SECI extraction panel accepts the SECI tender listing or an individual tender-detail URL. Default: the first 5 tenders as listed by SECI; maximum 25. The panel does not filter expired listings automatically: use a detail URL when you want a particular tender.

## Setup

1. Set `DATABASE_URL` and the existing `ADMIN_API_KEY` on the backend.
2. Set `OPENAI_API_KEY` as a server environment variable. Do not put it in the frontend or commit it. Optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`, which must be available to your API project and support structured Responses and PDF inputs.
3. Run `npm run migrate` before starting the updated server. Migration 004 adds extraction jobs, criterion records, and review audit batches without modifying existing eligibility data.
4. The Docker image installs `poppler-utils`. For local development install Poppler (`pdftotext` must be on PATH).
5. Run `npm start`. The server polls the PostgreSQL job queue every three seconds. No Redis is required. Missing API key disables extraction; existing dashboards and imports keep working.

## Workflow

1. Enter the SECI listing URL and batch size. Choose **Extract first batch**. The extraction saves the listing order for this run.
2. If a SECI Tender ID already exists, choose to re-extract for an update, skip it, or edit the saved tender. The extraction keeps the existing internal ID.
3. Check the extracted tenders on screen. Open a tender to review details, eligibility and linked documents. Fill missing required details if needed.
4. Leave the tenders you want selected and click **Import selected**. The server validates and imports their tender, eligibility and document rows in one transaction.
5. Choose **Next batch** to continue through the saved listing. A first batch of five covers positions 1–5, and the next batch covers 6–10. Starting a fresh extraction loads a new listing snapshot.

Excel exports and imports are available under the optional Excel controls. For edited workbooks, keep both IDs and headers, mark the rows you want to upload Approved, and upload all three files from the same extraction. The Excel preview can be reviewed before committing.

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
- `POST /jobs/:id/next` continues the saved listing. `POST /jobs/:id/import/preview` validates an on-screen selection before commit.
- `GET /jobs/:id/tenders.xlsx`, `/technical.xlsx`, `/financial.xlsx`
- `POST /jobs/:id/duplicates` with `{decisions}` resumes after duplicate decisions. `GET /existing/:id` opens a saved tender for editing.
- `POST /review/preview`: multipart `tenders`, `technical`, `financial`, with optional `decisions` JSON for newly detected duplicates
- `POST /review/:id/commit`: commits the stored preview, not client-supplied data

## Validation

Run `npm test` and `npm run build`. Agent tests cover source restrictions, HTML dates and amendments, partial failures, schema/refusal handling, workbook approval, source evidence, database relationships, import idempotency and rollback on stale previews. Tests use a mocked OpenAI endpoint and synthetic workbooks, never a real API key. Live paid model quality should be evaluated against a reviewer-checked sample before operational use.
