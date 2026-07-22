DROP POLICY IF EXISTS vision_datasets_admin_select ON storage.objects;
DROP POLICY IF EXISTS vision_datasets_admin_insert ON storage.objects;
DROP POLICY IF EXISTS vision_datasets_admin_update ON storage.objects;
DROP POLICY IF EXISTS vision_datasets_admin_delete ON storage.objects;

CREATE POLICY vision_datasets_auth_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vision-datasets');

CREATE POLICY vision_datasets_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vision-datasets');

CREATE POLICY vision_datasets_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-datasets')
  WITH CHECK (bucket_id = 'vision-datasets');

CREATE POLICY vision_datasets_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vision-datasets');