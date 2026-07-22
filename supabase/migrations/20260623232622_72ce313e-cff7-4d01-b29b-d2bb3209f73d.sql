
CREATE TABLE public.signup_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  verification_token text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signup_otp_codes_email_idx ON public.signup_otp_codes (email, created_at DESC);
GRANT ALL ON public.signup_otp_codes TO service_role;
ALTER TABLE public.signup_otp_codes ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role can access.
