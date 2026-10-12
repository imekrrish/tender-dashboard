-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. MASTER TABLES (CRUD ADMIN TARGETS)
-- ============================================================================

-- A. Geographic Regions
CREATE TABLE master_regions (
    region_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,             -- 'SA', 'SEA', 'EU', 'ME', 'AMER'
    name VARCHAR(100) NOT NULL,                    -- 'South Asia', 'Southeast Asia', etc.
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- B. Countries
CREATE TABLE master_countries (
    country_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES master_regions(region_id) ON DELETE RESTRICT,
    iso_code VARCHAR(10) UNIQUE NOT NULL,         -- 'IN', 'VN', 'DE', 'AE', 'US'
    name VARCHAR(100) NOT NULL,                    -- 'India', 'Vietnam', etc.
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- C. Product Segments (Includes FPV + BESS)
CREATE TABLE master_product_segments (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,             -- 'SOLAR_PV', 'FPV', 'FPV_BESS', 'BESS'
    name VARCHAR(100) NOT NULL,                    -- 'Solar PV', 'Floating Solar (FPV)', 'FPV + BESS'
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- D. Contract Scopes
CREATE TABLE master_contract_scopes (
    scope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,             -- 'EPC', 'RESCO', 'TBCB', 'SUPPLY'
    name VARCHAR(100) NOT NULL,                    -- 'Turnkey EPC', 'RESCO', 'Tariff-Based (TBCB)'
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- E. Issuing Authorities / Offtakers
CREATE TABLE tendering_authorities (
    authority_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,             -- 'SECI', 'NHPC', 'NTPC', 'EVN'
    name VARCHAR(255) NOT NULL,                    -- 'Solar Energy Corporation of India Limited'
    country_id UUID REFERENCES master_countries(country_id) ON DELETE RESTRICT,
    portal_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. TENDER STATUS & TAXONOMY ENUMS
-- ============================================================================
CREATE TYPE tender_status_enum AS ENUM (
    'Draft',
    'Open',                      -- Default dashboard view
    'Under Pre-Bid',
    'Under Evaluation',
    'Financial Evaluation',
    'Awarded',
    'Retendered',
    'Cancelled'
);

CREATE TYPE mounting_tech_enum AS ENUM (
    'Fixed Tilt',
    'Single-Axis Tracker',
    'Dual-Axis Tracker',
    'Pure Floater (HDPE)',
    'Elevated Agri Structure',
    'Ballasted Rooftop',
    'Containerized BESS',
    'N/A'
);

-- ============================================================================
-- 3. CORE TENDERS TABLE (PHASE 1 BASELINE)
-- ============================================================================
CREATE TABLE tenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_no BIGSERIAL UNIQUE,                   -- Display Sl. No
    tender_id VARCHAR(100) UNIQUE NOT NULL,       -- Primary ID (e.g. SECI000284)
    ref_number VARCHAR(150),                      -- Official NIT / Ref No.
    title VARCHAR(500) NOT NULL,                  -- Tender Title
    
    -- Relationships to Master Tables
    authority_id UUID NOT NULL REFERENCES tendering_authorities(authority_id) ON DELETE RESTRICT,
    scope_id UUID NOT NULL REFERENCES master_contract_scopes(scope_id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES master_product_segments(product_id) ON DELETE RESTRICT,
    country_id UUID NOT NULL REFERENCES master_countries(country_id) ON DELETE RESTRICT,
    state VARCHAR(100) NOT NULL,                  -- State / Province / Pan-India
    site_location TEXT,
    
    -- Lifecycle Status & Key Dates
    current_status tender_status_enum NOT NULL DEFAULT 'Open',
    tender_type VARCHAR(50) DEFAULT 'Domestic Open', -- Domestic Open, Global ICB, Limited
    tender_open_date DATE NOT NULL,
    tender_close_date TIMESTAMPTZ NOT NULL,       -- Bid Due Date
    pre_bid_meeting_date TIMESTAMPTZ,
    query_deadline TIMESTAMPTZ,
    bid_opening_date TIMESTAMPTZ,
    
    -- Technical Sizing & Parameters
    total_capacity_mw NUMERIC(10, 2) NOT NULL,    -- Grid injection / AC rating (MW)
    dc_capacity_mwp NUMERIC(10, 2),               -- DC overload rating (MWp)
    pv_type VARCHAR(100) NOT NULL,                -- Ground-Mount, Floating Solar, Rooftop C&I
    module_tech VARCHAR(100),                     -- TOPCon, HJT, Mono PERC, Bifacial
    module_eff_pct NUMERIC(5, 2),                 -- e.g. 21.50%
    mounting_tech mounting_tech_enum,             -- Tracker, Floater, Fixed Tilt
    
    -- Storage Specifics (populated for BESS, Solar+BESS, and FPV+BESS)
    storage_tech VARCHAR(100),                    -- LFP, Sodium-ion, Flow Battery
    storage_capacity_mw NUMERIC(10, 2),
    storage_capacity_mwh NUMERIC(10, 2),
    storage_duration_hours NUMERIC(4, 2),         -- e.g. 2.0 or 4.0 hrs
    round_trip_efficiency_rte_pct NUMERIC(5, 2),  -- e.g. 85.00%
    
    -- FPV Specifics (populated for FPV and FPV+BESS)
    water_body_type VARCHAR(100),                 -- Reservoir, Lake, Quarry, Dam
    water_depth_variation_m NUMERIC(6, 2),        -- Fluctuations affecting mooring design
    floater_tech TEXT,                            -- Material specs, mooring & anchoring
    
    -- Grid & Compliance Rules
    interconnection VARCHAR(100) DEFAULT 'ISTS (Central Grid)',
    substation_voltage_kv NUMERIC(6, 2),          -- 33, 132, 220, 400 kV
    almm_compliance_required BOOLEAN DEFAULT TRUE,
    dcr_mandatory BOOLEAN DEFAULT FALSE,
    
    -- Direct Links & Descriptions
    link_to_tender TEXT,                          -- Official portal link
    tender_details_1 TEXT,                        -- Scope & BOQ details
    tender_details_2 TEXT,                        -- Payment & commercial details
    remarks TEXT,                                 -- Editorial notes
    
    -- Audit Tracking
    database_entry_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_edited_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_edited_by VARCHAR(100)
);

-- ============================================================================
-- 4. COMMERCIAL & TECHNICAL ELIGIBILITY (1-TO-1 WITH TENDERS)
-- ============================================================================
CREATE TABLE tender_eligibility (
    tender_id UUID PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
    
    -- Financial Eligibility
    emd_currency VARCHAR(10) DEFAULT 'INR',
    emd_amount NUMERIC(15, 2),
    emd_mode VARCHAR(150),                        -- 'Bank Guarantee / RTGS / Surety Bond'
    desired_turnover NUMERIC(15, 2),              -- Minimum Average Annual Turnover (MAAT)
    net_worth_requirement NUMERIC(15, 2),
    working_capital_requirement NUMERIC(15, 2),
    estimated_project_value NUMERIC(15, 2),
    performance_bg_pct NUMERIC(5, 2),             -- Performance Bank Guarantee % (e.g. 5.00%)
    tender_document_fee NUMERIC(10, 2),
    
    -- Technical Eligibility
    manufacturer VARCHAR(255),                    -- OEM restrictions / Tier-1 / ALMM status
    min_manf_capacity_mw NUMERIC(10, 2),          -- Minimum manufacturing capacity requirement
    certifications TEXT,                          -- 'IEC 61215, IEC 61730, UL 9540, ASTM D1693'
    min_installed_capacity_mw NUMERIC(10, 2),     -- Bidder single-project commissioning track record
    
    -- Contractual & Consortium Terms
    ld_clause TEXT,                               -- Weekly penalty rate & conditions
    ld_cap_pct NUMERIC(5, 2) DEFAULT 10.00,       -- Cap percentage (e.g. 10.00%)
    no_of_partners_allowed INT DEFAULT 1          -- Consortium member limit
);

-- ============================================================================
-- 5. TENDER DOCUMENTS & BUCKETS (1-TO-MANY)
-- ============================================================================
CREATE TABLE tender_documents (
    doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    document_title VARCHAR(255) NOT NULL,         -- 'RfS Volume 1', 'Technical BOQ'
    doc_type VARCHAR(50),                         -- 'RfS', 'BOQ', 'PPA Draft', 'Eligibility Annexure'
    document_bucket_url TEXT NOT NULL,            -- S3 / Google Cloud Storage URI
    file_size_mb NUMERIC(6, 2),
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. CORRIGENDA & EXTENSION TRACKER (1-TO-MANY)
-- ============================================================================
CREATE TABLE tender_corrigenda (
    corrigendum_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    corrigendum_no INT NOT NULL,
    issue_date DATE NOT NULL,
    old_close_date TIMESTAMPTZ,
    new_close_date TIMESTAMPTZ,
    summary_of_changes TEXT,
    document_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. PHASE 2 EXPANSION: PLAYERS, AUCTIONS & WINNING BIDS (BI REPORTING)
-- ============================================================================

-- Market Players (Developers, EPCs, Inverter, Module, Floater OEMs)
CREATE TABLE market_players (
    player_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,            -- 'Tata Power Solar', 'Sungrow', 'Sterling & Wilson'
    company_type VARCHAR(50) NOT NULL,            -- 'Developer', 'EPC', 'Module OEM', 'Inverter OEM'
    headquarters_country_id UUID REFERENCES master_countries(country_id),
    website TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Auction Level Metrics
CREATE TABLE tender_auction_meta (
    auction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID UNIQUE REFERENCES tenders(id) ON DELETE CASCADE,
    auction_completed_date DATE NOT NULL,
    total_capacity_auctioned_mw NUMERIC(10, 2) NOT NULL,
    total_bids_received_mw NUMERIC(10, 2),
    oversubscription_ratio NUMERIC(5, 2),         -- e.g. 2.4x
    tariff_ceiling_rate NUMERIC(8, 4),            -- Benchmark cap if specified
    min_winning_tariff NUMERIC(8, 4) NOT NULL,    -- L1 discovered tariff
    max_winning_tariff NUMERIC(8, 4),             -- Highest cut-off tariff
    average_weighted_tariff NUMERIC(8, 4),
    tariff_currency VARCHAR(10) DEFAULT 'INR',
    tariff_unit VARCHAR(20) DEFAULT 'per_kWh',    -- 'per_kWh', 'per_MW_month'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Bidder Level Winning Results & Allocations
CREATE TABLE tender_bid_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    bidder_id UUID REFERENCES market_players(player_id) ON DELETE RESTRICT,
    
    bid_rank VARCHAR(10),                         -- 'L1', 'L2', 'L3'
    is_winner BOOLEAN DEFAULT TRUE,
    quoted_capacity_mw NUMERIC(10, 2) NOT NULL,
    allocated_capacity_mw NUMERIC(10, 2) NOT NULL,
    allocated_storage_mwh NUMERIC(10, 2),
    
    quoted_tariff NUMERIC(8, 4) NOT NULL,
    winning_tariff NUMERIC(8, 4) NOT NULL,        -- Discovered award tariff
    tariff_currency VARCHAR(10) DEFAULT 'INR',
    
    -- Execution Attribution
    epc_contractor_id UUID REFERENCES market_players(player_id) ON DELETE SET NULL,
    module_supplier_id UUID REFERENCES market_players(player_id) ON DELETE SET NULL,
    floater_supplier_id UUID REFERENCES market_players(player_id) ON DELETE SET NULL,
    
    ppa_signed BOOLEAN DEFAULT FALSE,
    ppa_signing_date DATE,
    scheduled_cod_date DATE,
    project_status VARCHAR(50) DEFAULT 'Awarded',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 8. PERFORMANCE INDEXES (FOR DASHBOARD SPEED)
-- ============================================================================
CREATE INDEX idx_tenders_status_close ON tenders(current_status, tender_close_date);
CREATE INDEX idx_tenders_product ON tenders(product_id);
CREATE INDEX idx_tenders_scope ON tenders(scope_id);
CREATE INDEX idx_tenders_country ON tenders(country_id);
CREATE INDEX idx_tenders_authority ON tenders(authority_id);
CREATE INDEX idx_tenders_capacity ON tenders(total_capacity_mw);


CREATE OR REPLACE VIEW view_taiyang_tender_radar AS
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


