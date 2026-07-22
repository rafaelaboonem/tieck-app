-- Rename short_slug to custom_slug
ALTER TABLE public.checklists RENAME COLUMN short_slug TO custom_slug;

-- Add custom_domain column (to store a linked domain if needed)
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- Update the uniqueness constraint if it exists (it might have been auto-renamed or needs drop/re-create)
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_short_slug_unique;
ALTER TABLE public.checklists ADD CONSTRAINT checklists_custom_slug_unique UNIQUE (custom_slug);

-- Update the trigger function to use the new column name
CREATE OR REPLACE FUNCTION public.set_unique_custom_slug()
RETURNS TRIGGER AS $$
DECLARE
  new_slug text;
  exists_already boolean;
BEGIN
  -- If custom_slug is not provided, generate a random 6-char one
  IF NEW.custom_slug IS NULL THEN
    LOOP
      new_slug := generate_short_slug(6);
      SELECT EXISTS (SELECT 1 FROM public.checklists WHERE custom_slug = new_slug) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    NEW.custom_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger with the updated function and column
DROP TRIGGER IF EXISTS tr_set_unique_short_slug ON public.checklists;
DROP TRIGGER IF EXISTS tr_set_unique_custom_slug ON public.checklists;
CREATE TRIGGER tr_set_unique_custom_slug
BEFORE INSERT ON public.checklists
FOR EACH ROW
EXECUTE FUNCTION public.set_unique_custom_slug();
