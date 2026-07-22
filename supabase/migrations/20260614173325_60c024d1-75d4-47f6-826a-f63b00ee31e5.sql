
-- 1. PROFILES: restrict anon access + prevent privilege escalation
DROP POLICY IF EXISTS "Perfis são visíveis por todos" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile safe columns"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin IS NOT DISTINCT FROM (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
    AND plan_type IS NOT DISTINCT FROM (SELECT p.plan_type FROM public.profiles p WHERE p.id = auth.uid())
  );

REVOKE SELECT ON public.profiles FROM anon;

-- 2. CHECKLIST_ANALYTICS: tighten UPDATE policy
DROP POLICY IF EXISTS "Public can update own session" ON public.checklist_analytics;

CREATE POLICY "Public can update recent own session"
  ON public.checklist_analytics FOR UPDATE
  TO anon, authenticated
  USING (started_at > (now() - interval '24 hours'))
  WITH CHECK (started_at > (now() - interval '24 hours'));

-- 3. WORKSPACE TASKS / CATEGORIES / CARD META: scope to workspace membership
DROP POLICY IF EXISTS "Manage workspace tasks" ON public.workspace_tasks;
DROP POLICY IF EXISTS "View workspace tasks" ON public.workspace_tasks;
CREATE POLICY "Members view workspace tasks"
  ON public.workspace_tasks FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "Editors manage workspace tasks"
  ON public.workspace_tasks FOR ALL TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

DROP POLICY IF EXISTS "Manage workspace categories" ON public.workspace_categories;
DROP POLICY IF EXISTS "View workspace categories" ON public.workspace_categories;
CREATE POLICY "Members view workspace categories"
  ON public.workspace_categories FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "Editors manage workspace categories"
  ON public.workspace_categories FOR ALL TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

DROP POLICY IF EXISTS "Manage card meta" ON public.workspace_card_meta;
DROP POLICY IF EXISTS "View card meta" ON public.workspace_card_meta;
CREATE POLICY "Members view card meta"
  ON public.workspace_card_meta FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "Editors manage card meta"
  ON public.workspace_card_meta FOR ALL TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- 4. STORAGE: workspace-assets ownership check on DELETE/UPDATE
DROP POLICY IF EXISTS "Users can delete their own workspace assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own workspace assets" ON storage.objects;

CREATE POLICY "Users can delete their own workspace assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workspace-assets'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own workspace assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'workspace-assets'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'workspace-assets'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 5. FUNCTION search_path hardening
ALTER FUNCTION public.generate_short_slug(integer) SET search_path = public;
ALTER FUNCTION public.set_unique_short_slug() SET search_path = public;
ALTER FUNCTION public.set_unique_custom_slug() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.handle_new_workspace_owner() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
