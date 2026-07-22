-- Storage buckets & policies. Evidences bucket is PRIVATE. Anonymous
-- users never upload directly — public evidence uploads are routed
-- through the upload-public-evidence edge function (service role).

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars', true),
  ('checklist-assets','checklist-assets', true),
  ('checklist-evidences','checklist-evidences', false),
  ('evidences','evidences', false),
  ('vision-datasets','vision-datasets', false),
  ('workspace-assets','workspace-assets', true)
ON CONFLICT (id) DO NOTHING;

-- AVATARS (public bucket, owner-scoped writes) -----------------------
CREATE POLICY "Avatars are publicly accessible" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- CHECKLIST-ASSETS (public bucket for authored assets only) ----------
-- NOTE: anonymous uploads have been removed. Public respondents send
-- their photos through the upload-public-evidence edge function, which
-- writes to the private checklist-evidences bucket using service role.
CREATE POLICY "Public can view checklist assets" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'checklist-assets');
CREATE POLICY "Authenticated users can upload checklist assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-assets');
CREATE POLICY "Users can update their own checklist assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'checklist-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own checklist assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- CHECKLIST-EVIDENCES (private) --------------------------------------
CREATE POLICY "checklist_evidences_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-evidences' AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.user_id = auth.uid() AND objects.name LIKE (c.id::text || '/%')));
CREATE POLICY "checklist_evidences_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-evidences' AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.user_id = auth.uid() AND objects.name LIKE (c.id::text || '/%')));

-- VISION-DATASETS (private) ------------------------------------------
CREATE POLICY vision_datasets_auth_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'vision-datasets');
CREATE POLICY vision_datasets_auth_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vision-datasets');
CREATE POLICY vision_datasets_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-datasets') WITH CHECK (bucket_id = 'vision-datasets');
CREATE POLICY vision_datasets_auth_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'vision-datasets');

-- WORKSPACE-ASSETS (public bucket for owner uploads) -----------------
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
