CREATE OR REPLACE FUNCTION public.__tmp_fail_ws() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RETURN NEW;
END $$;