-- Preserve the full descriptions found in tender documents.
-- PostgreSQL requires rebuilding the radar view around the module type change.
DO $$
DECLARE
    radar_view_sql text := pg_get_viewdef('view_taiyang_tender_radar'::regclass);
BEGIN
    DROP VIEW view_taiyang_tender_radar;
    ALTER TABLE tenders
        ALTER COLUMN module_tech TYPE TEXT,
        ALTER COLUMN interconnection TYPE TEXT;
    EXECUTE 'CREATE VIEW view_taiyang_tender_radar AS ' || radar_view_sql;
END
$$;
