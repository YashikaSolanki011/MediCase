CREATE TABLE IF NOT EXISTS benchmark_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  patient_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  language TEXT NOT NULL,
  chief_complaint TEXT NOT NULL,
  ground_truth JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES benchmark_patients(id) ON DELETE CASCADE,
  external_id TEXT UNIQUE NOT NULL,
  document_type TEXT NOT NULL,
  document_date DATE NOT NULL,
  filename TEXT NOT NULL,
  source_text TEXT NOT NULL,
  ground_truth JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_status TEXT NOT NULL DEFAULT 'not_run',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_documents_patient
  ON benchmark_documents(patient_id, document_date);