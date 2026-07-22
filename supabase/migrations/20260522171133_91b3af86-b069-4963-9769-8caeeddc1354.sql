-- Create a storage bucket for checklist assets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('checklist-assets', 'checklist-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public access to view files (needed for published checklists)
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'checklist-assets');

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload files" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'checklist-assets' AND 
  auth.role() = 'authenticated'
);

-- Policy: Allow users to update their own files
CREATE POLICY "Users can update their own files" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'checklist-assets' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Allow users to delete their own files
CREATE POLICY "Users can delete their own files" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'checklist-assets' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);