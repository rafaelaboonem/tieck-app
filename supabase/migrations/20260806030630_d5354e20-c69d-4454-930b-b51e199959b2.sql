
CREATE TABLE IF NOT EXISTS public.visual_standard_references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    visual_standard_id uuid NOT NULL REFERENCES public.visual_standards(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    storage_path text NOT NULL,
    position integer NOT NULL CHECK (position IN (1, 2)),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(visual_standard_id, position)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_standard_references TO authenticated;
GRANT ALL ON public.visual_standard_references TO service_role;

CREATE INDEX IF NOT EXISTS idx_vs_references_standard ON public.visual_standard_references(visual_standard_id);
CREATE INDEX IF NOT EXISTS idx_vs_references_workspace ON public.visual_standard_references(workspace_id);

ALTER TABLE public.visual_standard_references ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'visual_standard_references' AND policyname = 'Owners can access references of their workspaces'
    ) THEN
        CREATE POLICY "Owners can access references of their workspaces"
        ON public.visual_standard_references
        FOR ALL
        TO authenticated
        USING (
            workspace_id IN (
                SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
            )
        );
    END IF;
END $$;

INSERT INTO public.visual_standard_references (visual_standard_id, workspace_id, storage_path, position)
SELECT id, workspace_id, reference_path, 1
FROM public.visual_standards
WHERE reference_path IS NOT NULL
ON CONFLICT (visual_standard_id, position) DO NOTHING;
