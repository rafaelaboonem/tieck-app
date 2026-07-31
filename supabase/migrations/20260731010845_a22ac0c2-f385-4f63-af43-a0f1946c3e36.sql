CREATE OR REPLACE FUNCTION public.__tmp_fail_ws() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.owner_id AND p.display_name = 'QA ROLLBACK') THEN
    RAISE EXCEPTION 'tmp_rollback_test';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER __tmp_fail_ws BEFORE INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.__tmp_fail_ws();