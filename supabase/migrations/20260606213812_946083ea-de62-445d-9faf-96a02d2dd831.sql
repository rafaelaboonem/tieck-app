ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS published_content JSONB;
COMMENT ON COLUMN public.checklists.published_content IS 'Stores the blocks and title of the checklist at the time of publication.';
