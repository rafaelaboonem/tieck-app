-- Tentar criar a tabela se não existir
CREATE TABLE IF NOT EXISTS public.password_reset_codes (
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
REVOKE ALL ON public.password_reset_codes FROM anon, authenticated;

-- Dropar função antiga se conflitar com o tipo de retorno
DROP FUNCTION IF EXISTS public.get_user_id_by_email(text);

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;