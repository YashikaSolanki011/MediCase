CREATE TABLE IF NOT EXISTS clinical_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT,
  patient_age INTEGER,
  language TEXT,
  chief_complaint TEXT,
  intake_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)