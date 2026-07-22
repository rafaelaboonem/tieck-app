
-- =========================
-- UNITS
-- =========================
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_units_workspace ON public.units(workspace_id);
CREATE INDEX idx_units_active ON public.units(workspace_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view units"
  ON public.units FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

CREATE POLICY "Editors can insert units"
  ON public.units FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "Editors can update units"
  ON public.units FOR UPDATE TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "Editors can delete units"
  ON public.units FOR DELETE TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- SHIFTS
-- =========================
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_workspace ON public.shifts(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

CREATE POLICY "Editors can insert shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "Editors can update shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
  WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "Editors can delete shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- CHECKLISTS EXTENSIONS
-- =========================
ALTER TABLE public.checklists
  ADD COLUMN unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  ADD COLUMN target_time TIME,
  ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_checklists_unit ON public.checklists(unit_id);
CREATE INDEX idx_checklists_shift ON public.checklists(shift_id);
