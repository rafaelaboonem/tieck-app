-- Functions required BEFORE table creation (used in column DEFAULTs).
-- Every other function lives in 05_functions_and_rpc.sql.

CREATE OR REPLACE FUNCTION public.generate_dataset_public_id() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  code_len int;
  idx int;
  attempts int := 0;
BEGIN
  LOOP
    code_len := 6 + floor(random() * 3)::int;
    candidate := '';

    FOR idx IN 1..code_len LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;

    PERFORM 1
    FROM public.vision_datasets AS vd
    WHERE vd.public_id = candidate;

    IF NOT FOUND THEN
      RETURN candidate;
    END IF;

    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar public_id único';
    END IF;
  END LOOP;
END;
$$;