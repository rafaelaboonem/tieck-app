DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public can view checklist assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload response checklist assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload checklist assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own checklist assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own checklist assets" ON storage.objects;
DROP POLICY IF EXISTS "checklist_evidences_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "checklist_evidences_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "evidences_owner_all" ON storage.objects;
DROP POLICY IF EXISTS "vision_datasets_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "vision_datasets_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "vision_datasets_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "vision_datasets_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "Workspace assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload workspace assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own workspace assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own workspace assets" ON storage.objects;

CREATE POLICY "Avatars are publicly accessible" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view checklist assets" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'checklist-assets');
CREATE POLICY "Public can upload response checklist assets" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'checklist-assets' AND name LIKE 'responses/%');
CREATE POLICY "Authenticated users can upload checklist assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-assets');
CREATE POLICY "Users can update their own checklist assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'checklist-assets' AND ((auth.uid())::text = (storage.foldername(name))[1] OR name LIKE 'responses/%'))
  WITH CHECK (bucket_id = 'checklist-assets');
CREATE POLICY "Users can delete their own checklist assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-assets' AND ((auth.uid())::text = (storage.foldername(name))[1] OR name LIKE 'responses/%'));

CREATE POLICY "checklist_evidences_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-evidences' AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE (c.user_id = auth.uid() OR (c.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
    ))) AND storage.objects.name LIKE (c.id::text || '/%')
  ));
CREATE POLICY "checklist_evidences_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-evidences' AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE (c.user_id = auth.uid() OR (c.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
    ))) AND storage.objects.name LIKE (c.id::text || '/%')
  ));

CREATE POLICY "evidences_owner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'evidences')
  WITH CHECK (bucket_id = 'evidences');

CREATE POLICY "vision_datasets_auth_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'vision-datasets');
CREATE POLICY "vision_datasets_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vision-datasets');
CREATE POLICY "vision_datasets_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-datasets') WITH CHECK (bucket_id = 'vision-datasets');
CREATE POLICY "vision_datasets_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'vision-datasets');

CREATE POLICY "Workspace assets are publicly accessible" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'workspace-assets');
CREATE POLICY "Authenticated users can upload workspace assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'workspace-assets');
CREATE POLICY "Users can update their own workspace assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'workspace-assets' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'workspace-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own workspace assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'workspace-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);