-- Cleanup insecure or deprecated functions
DROP FUNCTION IF EXISTS public.promote_user_to_petwalker(text);
DROP FUNCTION IF EXISTS public.check_user_is_petwalker(text);
DROP FUNCTION IF EXISTS public.confirm_and_promote_user_by_email(text, text);

-- Placeholder for no-op migrations required by audit
SELECT 1;