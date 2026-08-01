CREATE TABLE IF NOT EXISTS public.visual_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  question text NOT NULL,
  internal_notes text,
  reference_path text,
  status text NOT NULL DEFAULT 'draft',
  test_count integer NOT NULL DEFAULT 0,
  accuracy numeric,
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visual_standards_status_check CHECK (status IN ('draft','testing','validated','needs_improvement'))
);

CREATE INDEX IF NOT EXISTS visual_standards_workspace_idx ON public.visual_standards(workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_standards TO authenticated;
GRANT ALL ON public.visual_standards TO service_role;

ALTER TABLE public.visual_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visual_standards_workspace_owner_all"
  ON public.visual_standards
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = visual_standards.workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = visual_standards.workspace_id AND w.owner_id = auth.uid()));

DROP TRIGGER IF EXISTS visual_standards_set_updated_at ON public.visual_standards;
CREATE TRIGGER visual_standards_set_updated_at
  BEFORE UPDATE ON public.visual_standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "visual_standards_ref_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'visual-standards'
    AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = auth.uid() AND w.id::text = (storage.foldername(name))[1])
  );

CREATE POLICY "visual_standards_ref_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visual-standards'
    AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = auth.uid() AND w.id::text = (storage.foldername(name))[1])
  );

CREATE POLICY "visual_standards_ref_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'visual-standards'
    AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = auth.uid() AND w.id::text = (storage.foldername(name))[1])
  );