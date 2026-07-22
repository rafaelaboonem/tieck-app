-- Política para permitir que usuários anônimos façam upload na pasta 'responses' do bucket 'checklist-assets'
CREATE POLICY "Public can upload to responses folder"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'checklist-assets' AND
  (storage.foldername(name))[1] = 'responses'
);

-- Política para permitir que usuários anônimos vejam os arquivos no bucket público 'checklist-assets'
CREATE POLICY "Public can view checklist assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'checklist-assets');
