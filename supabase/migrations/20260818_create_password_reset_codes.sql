CREATE TABLE public.password_reset_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email_normalized text NOT NULL,
    code_hash text NOT NULL,
    verification_token_hash text,
    expires_at timestamptz NOT NULL,
    verification_expires_at timestamptz,
    attempts integer DEFAULT 0,
    verified_at timestamptz,
    consumed_at timestamptz,
    last_sent_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.password_reset_codes TO service_role;
