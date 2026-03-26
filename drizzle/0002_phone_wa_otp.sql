-- Add phone number and WhatsApp OTP verification support

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- WhatsApp OTP tokens (4-digit, short-lived)
CREATE TABLE IF NOT EXISTS wa_otp_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) NOT NULL,
  otp         VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wa_otp_tokens_phone_idx ON wa_otp_tokens (phone);

-- Clean up expired OTPs automatically (optional, manual cleanup also in app)
CREATE INDEX IF NOT EXISTS wa_otp_tokens_expires_idx ON wa_otp_tokens (expires_at);
