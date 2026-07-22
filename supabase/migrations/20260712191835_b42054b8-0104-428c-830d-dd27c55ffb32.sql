
CREATE OR REPLACE FUNCTION public.generate_dataset_public_id()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := 'pad_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    PERFORM 1 FROM public.vision_datasets vd WHERE vd.public_id = candidate;
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 25 THEN
      RAISE EXCEPTION 'Não foi possível gerar public_id único';
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.vision_datasets
  ADD COLUMN IF NOT EXISTS public_id text;

DO $$
DECLARE r record; new_pid text;
BEGIN
  FOR r IN SELECT id FROM public.vision_datasets WHERE public_id IS NULL LOOP
    new_pid := public.generate_dataset_public_id();
    UPDATE public.vision_datasets SET public_id = new_pid WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.vision_datasets
  ALTER COLUMN public_id SET NOT NULL,
  ALTER COLUMN public_id SET DEFAULT public.generate_dataset_public_id();

CREATE UNIQUE INDEX IF NOT EXISTS vision_datasets_public_id_key
  ON public.vision_datasets (public_id);

CREATE OR REPLACE FUNCTION public.vision_datasets_prevent_public_id_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN
    RAISE EXCEPTION 'public_id é imutável';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vision_datasets_public_id_immutable ON public.vision_datasets;
CREATE TRIGGER trg_vision_datasets_public_id_immutable
  BEFORE UPDATE ON public.vision_datasets
  FOR EACH ROW EXECUTE FUNCTION public.vision_datasets_prevent_public_id_update();
