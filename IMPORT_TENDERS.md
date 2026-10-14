# Private workbook import

The importer accepts a reconciled JSON bundle from a private local file. Source workbook records are deliberately excluded from this repository. The last two source sheets are reconciled into one dataset; overlapping representations must not be treated as separate batches.

```sh
npm run migrate
npm run import:tenders -- --file /private/path/tenders-import.json --dry-run
npm run import:tenders -- --file /private/path/tenders-import.json --apply
```

Dry-run is the default. An explicit apply runs the full batch in a transaction and records its content hash. An exact repeat is skipped. Changed contents under an existing import key or conflicting existing IDs fail without overwriting existing records. For automatic deployment seeding, configure the private `TENDER_SEED_BASE64` variable; the deployment preparation script runs the same idempotent importer after migrations. Keep the bundle in a private environment when importing it.

Migration 002 retains site location, coordinates, tags and source context. Full eligibility conditions and non-percentage commercial terms have separate text fields. Source records preserve both representations for review; workbook SQL is never executed against PostgreSQL. The source sheets are supplied samples and are labeled accordingly in the dashboard. Document URLs and tender facts still need official verification.

The prepared data is provided privately. The production DB connection is still required to apply it and verify against real PostgreSQL. Tests use synthetic data and pg-mem.

## Excel bulk upload in the browser

Open **Master Tables (CRUD)**, sign in with the admin PIN, and select **Tenders**.
Download the Excel template, fill its **Tenders** sheet, then select **Upload Excel**.
Reference sheets list existing country, product, scope and authority codes. Create missing
catalog entries first, then download a fresh template. Required columns are listed on the
Instructions sheet. Use real Excel dates or ISO dates; include a timezone for timestamps.

Uploads accept `.xlsx` / `.xls`, up to 5 MB and 1,000 tenders. Validation errors identify
Excel row numbers. Every row is validated before writing, and all inserts share a transaction:
a failed row or duplicate tender ID cancels the entire batch. Existing tenders are never overwritten.

Public status, admin listings, filters, KPIs and CSV export automatically show
**Under Evaluation** for Open / Under Pre-Bid tenders after `tender_close_date` has passed.
Comparison uses the full timestamp and respects its timezone. Draft records remain hidden;
Awarded, Cancelled and other manually maintained workflow statuses remain unchanged.
Closing-date edits immediately change the calculated status. The visible dashboard refreshes
every minute and when the tab gains focus. No scheduled job or new migration is required.

Price Index is temporarily hidden, including previously remembered module selections.
Tender document links appear under **Tender Details and Documents (Official Portal)**.

Endpoints (admin authentication required):
- `GET /api/radar/admin/tenders/template.xlsx`
- `POST /api/radar/admin/tenders/upload` with multipart field `file`
