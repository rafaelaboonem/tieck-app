INSERT INTO storage.buckets (id, name, public) VALUES ('workspace-assets', 'workspace-assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Workspace assets are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'workspace-assets');

CREATE POLICY "Authenticated users can upload workspace assets" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'workspace-assets');

CREATE POLICY "Users can update their own workspace assets" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (bucket_id = 'workspace-assets');

CREATE POLICY "Users can delete their own workspace assets" 
ON storage.objects FOR DELETE 
TO authenticated
USING (bucket_id = 'workspace-assets');