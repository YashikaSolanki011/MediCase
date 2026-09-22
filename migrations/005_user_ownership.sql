ALTER TABLE clinical_sessions ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clinical_sessions_owner_updated ON clinical_sessions(owner_user_id, updated_at DESC);