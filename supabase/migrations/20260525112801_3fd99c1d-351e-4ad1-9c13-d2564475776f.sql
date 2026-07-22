ALTER TABLE public.checklists ADD COLUMN category TEXT;
COMMENT ON COLUMN public.checklists.category IS 'Categoria ou grupo para organização na área de trabalho.';