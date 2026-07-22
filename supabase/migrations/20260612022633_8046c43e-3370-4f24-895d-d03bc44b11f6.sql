-- Create function to generate random alphanumeric string
CREATE OR REPLACE FUNCTION public.generate_short_slug(length integer DEFAULT 6)
RETURNS text AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer := 0;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add short_slug column to checklists table
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS short_slug TEXT;

-- Create a function to ensure uniqueness on insert
CREATE OR REPLACE FUNCTION public.set_unique_short_slug()
RETURNS TRIGGER AS $$
DECLARE
  new_slug text;
  exists_already boolean;
BEGIN
  IF NEW.short_slug IS NULL THEN
    LOOP
      new_slug := generate_short_slug(6);
      SELECT EXISTS (SELECT 1 FROM public.checklists WHERE short_slug = new_slug) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    NEW.short_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for new rows
DROP TRIGGER IF EXISTS tr_set_unique_short_slug ON public.checklists;
CREATE TRIGGER tr_set_unique_short_slug
BEFORE INSERT ON public.checklists
FOR EACH ROW
EXECUTE FUNCTION public.set_unique_short_slug();

-- Populate existing rows (one-time update)
UPDATE public.checklists 
SET short_slug = generate_short_slug(6) 
WHERE short_slug IS NULL;

-- Add unique constraint
ALTER TABLE public.checklists ADD CONSTRAINT checklists_short_slug_unique UNIQUE (short_slug);

-- Ensure permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO service_role;
GRANT SELECT ON public.checklists TO anon;
