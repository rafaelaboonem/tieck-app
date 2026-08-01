GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_standards TO authenticated;
GRANT ALL ON public.visual_standards TO service_role;

DROP POLICY IF EXISTS visual_standards_ref_select ON storage.objects;
DROP POLICY IF EXISTS visual_standards_ref_insert ON storage.objects;
DROP POLICY IF EXISTS visual_standards_ref_delete ON storage.objects;
DROP POLICY IF EXISTS visual_standards_ref_update ON storage.objects;

CREATE POLICY visual_standards_ref_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'visual-standards'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.owner_id = auth.uid()
      AND w.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY visual_standards_ref_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'visual-standards'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.owner_id = auth.uid()
      AND w.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY visual_standards_ref_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'visual-standards'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.owner_id = auth.uid()
      AND w.id::text = (storage.foldername(storage.objects.name))[1]
  )
)
WITH CHECK (
  bucket_id = 'visual-standards'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.owner_id = auth.uid()
      AND w.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY visual_standards_ref_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'visual-standards'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.owner_id = auth.uid()
      AND w.id::text = (storage.foldername(storage.objects.name))[1]
  )
);