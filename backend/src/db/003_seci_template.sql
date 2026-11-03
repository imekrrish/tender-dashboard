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
