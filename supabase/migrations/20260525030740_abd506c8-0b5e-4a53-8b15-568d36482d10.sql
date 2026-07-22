-- Function to get user ID by email (safe, only returns ID if exists)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_to_find TEXT)
RETURNS TABLE (user_id UUID) AS $$
BEGIN
  RETURN QUERY SELECT id FROM auth.users WHERE email = email_to_find;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;
