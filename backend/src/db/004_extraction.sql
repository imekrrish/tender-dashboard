CREATE TABLE radar_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  tender_limit INT NOT NULL CHECK (tender_limit BETWEEN 1 AND 25),
  status TEXT NOT NULL DEFAULT 'queued',
  progress TEXT NOT NULL DEFAULT 'Waiting to start',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX radar_jobs_status ON radar_extraction_jobs(status, created_at);
CREATE TABLE tender_eligibility_criteria (
  criterion_id TEXT PRIMARY KEY,
  tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('Technical','Financial','General')),
  requirement TEXT NOT NULL,
  reviewed_data JSONB NOT NULL,
  extraction_job_id UUID REFERENCES radar_extraction_jobs(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX radar_criteria_tender ON tender_eligibility_criteria(tender_id, category);
CREATE TABLE radar_review_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  summary JSONB NOT NULL,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
