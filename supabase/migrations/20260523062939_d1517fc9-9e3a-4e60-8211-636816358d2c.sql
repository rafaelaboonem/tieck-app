-- Allow public uploads to checklist-assets bucket under responses/ folder
CREATE POLICY "Public can upload response assets"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'checklist-assets' AND
  (storage.foldername(name))[1] = 'responses'
);

-- Ensure public select is available (already exists but making sure it's robust)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Public Access' 
        AND tablename = 'objects' 
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Public Access"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'checklist-assets');
    END IF;
END $$;
