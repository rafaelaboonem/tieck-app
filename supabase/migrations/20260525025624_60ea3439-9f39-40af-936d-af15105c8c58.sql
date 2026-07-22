-- Add email verification fields to user_domains
ALTER TABLE public.user_domains 
ADD COLUMN IF NOT EXISTS dkim_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS spf_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS return_path_verified BOOLEAN DEFAULT false;

-- Add custom_email_domain_id to checklists
ALTER TABLE public.checklists
ADD COLUMN IF NOT EXISTS custom_email_domain_id UUID REFERENCES public.user_domains(id);

-- Create a policy for checking domains if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_domains' AND policyname = 'Users can view their own domains'
    ) THEN
        CREATE POLICY "Users can view their own domains" 
        ON public.user_domains FOR SELECT 
        USING (auth.uid() = user_id);
    END IF;
END $$;