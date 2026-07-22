-- Políticas RLS restringindo o bucket privado `vision-datasets` a administradores.
-- storage.objects já tem RLS habilitado pelo Supabase.

DROP POLICY IF EXISTS "vision_datasets_admin_select" ON storage.objects;
CREATE POLICY "vision_datasets_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vision-datasets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "vision_datasets_admin_insert" ON storage.objects;
CREATE POLICY "vision_datasets_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vision-datasets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "vision_datasets_admin_update" ON storage.objects;
CREATE POLICY "vision_datasets_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-datasets' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'vision-datasets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "vision_datasets_admin_delete" ON storage.objects;
CREATE POLICY "vision_datasets_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vision-datasets' AND public.has_role(auth.uid(), 'admin'::public.app_role));