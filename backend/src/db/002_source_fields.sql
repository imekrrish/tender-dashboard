-- Preserve location and source context from the supplied workbook without
-- overwriting migration 001 on databases where it has already been applied.
ALTER TABLE tenders ADD COLUMN site_address TEXT;
ALTER TABLE tenders ADD COLUMN postal_code VARCHAR(20);
ALTER TABLE tenders ADD COLUMN city VARCHAR(100);
ALTER TABLE tenders ADD COLUMN latitude NUMERIC(9,6);
ALTER TABLE tenders ADD COLUMN longitude NUMERIC(9,6);
ALTER TABLE tenders ADD COLUMN map_zoom_level INT;
ALTER TABLE tenders ADD COLUMN analysis_tags TEXT[];
ALTER TABLE tenders ADD COLUMN primary_category VARCHAR(255);
ALTER TABLE tenders ADD COLUMN import_source VARCHAR(100);
ALTER TABLE tenders ADD COLUMN source_data JSONB;
ALTER TABLE tender_eligibility ADD COLUMN technical_track_record_text TEXT;
ALTER TABLE tender_eligibility ADD COLUMN performance_bg_terms TEXT;
ALTER TABLE tender_eligibility ADD COLUMN estimated_project_value_terms TEXT;
ALTER TABLE tender_eligibility ADD COLUMN source_data JSONB;
ALTER TABLE tender_documents ADD COLUMN source_data JSONB;
CREATE TABLE radar_imports (
  import_key TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  counts JSONB NOT NULL
);
