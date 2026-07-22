CREATE OR REPLACE FUNCTION public.generate_dataset_public_id()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
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

ALTER TABLE public.vision_datasets
  ALTER COLUMN public_id SET DEFAULT public.generate_dataset_public_id();

ALTER TABLE public.vision_datasets
  DROP CONSTRAINT IF EXISTS vision_datasets_public_id_format_check;

ALTER TABLE public.vision_datasets
  ADD CONSTRAINT vision_datasets_public_id_format_check
  CHECK (public_id ~ '^[A-Z0-9]{6,8}$') NOT VALID;

CREATE OR REPLACE FUNCTION public.vision_datasets_prevent_public_id_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN
    IF OLD.public_id ~* '^pad_[a-z0-9]{6,8}$'
       AND NEW.public_id = upper(substring(OLD.public_id FROM 5)) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'public_id é imutável';
  END IF;

  RETURN NEW;
END;
$$;