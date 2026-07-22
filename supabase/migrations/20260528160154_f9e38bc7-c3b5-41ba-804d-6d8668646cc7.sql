ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
