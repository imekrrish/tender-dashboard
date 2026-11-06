-- PostgreSQL blocks ALTER COLUMN TYPE while this view depends on scope
-- names and capacity. Rebuild it in the migration transaction; never CASCADE.
DROP VIEW view_taiyang_tender_radar;

-- Published SECI listings do not always specify a state, capacity or PV type.
-- Preserve unknown values as NULL instead of inventing a location or zero MW.
ALTER TABLE tenders ALTER COLUMN state DROP NOT NULL;
ALTER TABLE tenders ALTER COLUMN total_capacity_mw DROP NOT NULL;
ALTER TABLE tenders ALTER COLUMN pv_type DROP NOT NULL;
-- Source scopes are descriptive sentences, not just short catalog labels.
ALTER TABLE master_contract_scopes ALTER COLUMN name TYPE TEXT;
-- Retain sub-kW precision in rooftop capacities supplied in MW.
ALTER TABLE tenders ALTER COLUMN total_capacity_mw TYPE NUMERIC(16,6);
-- A generic rooftop listing does not establish ballasted or fixed-tilt mounting.
ALTER TYPE mounting_tech_enum ADD VALUE 'Rooftop';

-- Restore the public projection after both type changes.
CREATE VIEW view_taiyang_tender_radar AS
SELECT
    t.id,
    t.serial_no,
    t.tender_id,
    t.ref_number,
    t.title,
    t.current_status,
    r.name AS region,
    c.name AS country,
    t.state,
    p.name AS product,
    s.name AS scope,
    a.name AS authority,
    t.total_capacity_mw,
    t.storage_capacity_mwh,
    t.pv_type,
    t.module_tech,
    t.mounting_tech,
    e.emd_currency,
    e.emd_amount,
    e.desired_turnover,
    e.min_installed_capacity_mw,
    e.manufacturer AS manufacturer_class,
    e.certifications,
    e.ld_clause,
    t.tender_open_date,
    t.tender_close_date,
    t.link_to_tender
FROM tenders t
JOIN master_product_segments p ON t.product_id = p.product_id
JOIN master_contract_scopes s ON t.scope_id = s.scope_id
JOIN master_countries c ON t.country_id = c.country_id
JOIN master_regions r ON c.region_id = r.region_id
JOIN tendering_authorities a ON t.authority_id = a.authority_id
LEFT JOIN tender_eligibility e ON t.id = e.tender_id;
