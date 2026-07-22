-- ============================================
-- 1) Papéis + funções de acesso (multi-tenant)
-- ============================================
CREATE TYPE public.app_role AS ENUM (
  'funcionario',
  'gerente',
  'supervisor',
  'franqueadora',
  'admin',
  'auditor'
);

-- workspaces = organizations no schema atual; guardamos escopo (org/unidade/turno)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  organization_id UUID,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, organization_id, unit_id, shift_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Regras de acesso por unidade:
-- admin/franqueadora → toda a rede
-- supervisor → unidades do escopo (unit_id) OU toda a organization_id
-- gerente/funcionario/auditor → apenas a unidade do escopo
CREATE OR REPLACE FUNCTION public.can_access_unit(
  _user_id UUID, _org_id UUID, _unit_id UUID
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role IN ('admin', 'franqueadora')
        OR (ur.role = 'supervisor'
            AND (ur.unit_id = _unit_id OR ur.organization_id = _org_id))
        OR (ur.role IN ('gerente', 'funcionario', 'auditor')
            AND ur.unit_id = _unit_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer(_user_id UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('gerente','supervisor','franqueadora','admin')
  );
$$;

-- ============================================
-- 2) Evidências (fotos) — tabela + RLS
-- ============================================
CREATE TABLE public.evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  task_id UUID,
  storage_path TEXT NOT NULL,          -- org/unit/YYYY/MM/task/uuid.jpg (bucket privado)
  reference_path TEXT,                 -- caminho da foto-padrão para comparação
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','resubmit_requested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidences TO authenticated;
GRANT ALL ON public.evidences TO service_role;
ALTER TABLE public.evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read evidences by unit access"
  ON public.evidences FOR SELECT TO authenticated
  USING (public.can_access_unit(auth.uid(), organization_id, unit_id));

CREATE POLICY "insert evidences by unit access"
  ON public.evidences FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.can_access_unit(auth.uid(), organization_id, unit_id)
  );

CREATE POLICY "update evidences by reviewers"
  ON public.evidences FOR UPDATE TO authenticated
  USING (
    public.can_access_unit(auth.uid(), organization_id, unit_id)
    AND public.is_reviewer(auth.uid())
  );

CREATE TRIGGER update_evidences_updated_at
  BEFORE UPDATE ON public.evidences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX evidences_unit_status_idx
  ON public.evidences (unit_id, status, submitted_at DESC);

-- ============================================
-- 3) Revisões de evidência (aprovar / rejeitar / NC / ação corretiva)
-- ============================================
CREATE TABLE public.evidence_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES public.evidences(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'approve','reject','request_resubmit','note','corrective_action','nonconformity'
  )),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.evidence_reviews TO authenticated;
GRANT ALL ON public.evidence_reviews TO service_role;
ALTER TABLE public.evidence_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read reviews via evidence access"
  ON public.evidence_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evidences e
      WHERE e.id = evidence_id
        AND public.can_access_unit(auth.uid(), e.organization_id, e.unit_id)
    )
  );

CREATE POLICY "insert reviews as reviewer"
  ON public.evidence_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND public.is_reviewer(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.evidences e
      WHERE e.id = evidence_id
        AND public.can_access_unit(auth.uid(), e.organization_id, e.unit_id)
    )
  );

-- ============================================
-- 4) Políticas de Storage para o bucket privado 'evidences'
--    Caminho: {organization_id}/{unit_id}/{YYYY}/{MM}/{task_id}/{file}
-- ============================================
CREATE POLICY "storage read evidences by unit access"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidences'
    AND public.can_access_unit(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid,
      NULLIF((storage.foldername(name))[2], '')::uuid
    )
  );

CREATE POLICY "storage insert evidences by unit access"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidences'
    AND public.can_access_unit(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid,
      NULLIF((storage.foldername(name))[2], '')::uuid
    )
  );

CREATE POLICY "storage delete evidences by reviewers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidences'
    AND public.is_reviewer(auth.uid())
    AND public.can_access_unit(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid,
      NULLIF((storage.foldername(name))[2], '')::uuid
    )
  );