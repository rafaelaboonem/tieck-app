-- Function: extract storage paths from a response's answers jsonb and delete from storage.objects
CREATE OR REPLACE FUNCTION public.delete_response_storage_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_url text;
  v_path text;
  v_marker text := '/checklist-assets/';
  v_idx int;
BEGIN
  IF OLD.answers IS NULL THEN
    RETURN OLD;
  END IF;

  -- Walk every string value in the answers jsonb tree, looking for URLs that point to the checklist-assets bucket.
  FOR v_url IN
    SELECT value::text
    FROM jsonb_path_query(OLD.answers, 'strict $.**?(@.type() == "string")') AS value
  LOOP
    -- value::text wraps strings in quotes; strip them
    v_url := btrim(v_url, '"');

    v_idx := position(v_marker IN v_url);
    IF v_idx > 0 THEN
      v_path := substring(v_url FROM v_idx + length(v_marker));
      -- Strip any query string
      v_path := split_part(v_path, '?', 1);

      IF v_path <> '' THEN
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'checklist-assets'
            AND name = v_path;
        EXCEPTION WHEN OTHERS THEN
          -- Never block the response deletion if storage cleanup fails
          RAISE WARNING 'Falha ao apagar arquivo do storage %: %', v_path, SQLERRM;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

-- Trigger: runs before each row is deleted from checklist_responses
DROP TRIGGER IF EXISTS trg_delete_response_storage_files ON public.checklist_responses;
CREATE TRIGGER trg_delete_response_storage_files
BEFORE DELETE ON public.checklist_responses
FOR EACH ROW
EXECUTE FUNCTION public.delete_response_storage_files();