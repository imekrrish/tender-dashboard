# Private workbook import

The importer accepts a reconciled JSON bundle from a private local file. Source workbook records are deliberately excluded from this repository. The last two source sheets are reconciled into one dataset; overlapping representations must not be treated as separate batches.

```sh
npm run migrate
npm run import:tenders -- --file /private/path/tenders-import.json --dry-run
npm run import:tenders -- --file /private/path/tenders-import.json --apply
```

Dry-run is the default. An explicit apply runs the full batch in a transaction and records its content hash. An exact repeat is skipped. Changed contents under an existing import key or conflicting existing IDs fail without overwriting existing records. Do not add this one-time operation to the recurring Railway pre-deploy command. Keep the bundle in a private environment when importing it.

Migration 002 retains site location, coordinates, tags and source context. Full eligibility conditions and non-percentage commercial terms have separate text fields. Source records preserve both representations for review; workbook SQL is never executed against PostgreSQL. The source sheets are supplied samples and are labeled accordingly in the dashboard. Document URLs and tender facts still need official verification.

The prepared data is provided privately. The production DB connection is still required to apply it and verify against real PostgreSQL. Tests use synthetic data and pg-mem.
