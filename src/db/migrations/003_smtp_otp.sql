-- Google SMTP for OTP verification
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_email VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_app_password VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com';
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER NOT NULL DEFAULT 587;

CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  otp_hash VARCHAR(255) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_verifications_user ON otp_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires ON otp_verifications (expires_at);
