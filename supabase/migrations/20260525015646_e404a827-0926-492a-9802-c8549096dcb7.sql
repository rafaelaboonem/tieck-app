-- First, ensure the timestamp function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create user_domains table
CREATE TABLE IF NOT EXISTS public.user_domains (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
    dns_verification_record TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_domains ENABLE ROW LEVEL SECURITY;

-- Policies for user_domains
CREATE POLICY "Users can view their own domains" 
ON public.user_domains 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Pro users can add their own domains" 
ON public.user_domains 
FOR INSERT 
WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND plan_type = 'pro'
    )
);

CREATE POLICY "Users can delete their own domains" 
ON public.user_domains 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add custom_domain column to checklists if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM Information_schema.columns WHERE table_name = 'checklists' AND column_name = 'custom_domain') THEN
        ALTER TABLE public.checklists ADD COLUMN custom_domain TEXT;
    END IF;
END $$;

-- Create trigger for updated_at on user_domains
DROP TRIGGER IF EXISTS update_user_domains_updated_at ON public.user_domains;
CREATE TRIGGER update_user_domains_updated_at
BEFORE UPDATE ON public.user_domains
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();