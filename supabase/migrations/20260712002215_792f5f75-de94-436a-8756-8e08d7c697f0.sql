-- 1) Coluna obrigatória (tabela vazia — pode ser NOT NULL direto)
ALTER TABLE public.evidences
  ADD COLUMN task_execution_id uuid NOT NULL;

-- 2) FK segura para auditoria (evita apagar execução com evidências)
ALTER TABLE public.evidences
  ADD CONSTRAINT evidences_task_execution_id_fkey
  FOREIGN KEY (task_execution_id)
  REFERENCES public.task_executions(id)
  ON DELETE RESTRICT;

-- 3) Índice para lookups por execução
CREATE INDEX IF NOT EXISTS evidences_task_execution_id_idx
  ON public.evidences(task_execution_id);

-- 4) Trigger de consistência: organization_id, unit_id e task_id
--    devem sempre coincidir com os da execução vinculada.
CREATE OR REPLACE FUNCTION public.check_evidence_execution_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ex_org uuid;
  ex_unit uuid;
  ex_task uuid;
BEGIN
  SELECT organization_id, unit_id, task_id
    INTO ex_org, ex_unit, ex_task
  FROM public.task_executions
  WHERE id = NEW.task_execution_id;

  IF ex_org IS NULL THEN
    RAISE EXCEPTION 'Execução % não encontrada para vínculo de evidência', NEW.task_execution_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM ex_org THEN
    RAISE EXCEPTION 'organization_id da evidência (%) difere da execução (%)', NEW.organization_id, ex_org
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.unit_id IS DISTINCT FROM ex_unit THEN
    RAISE EXCEPTION 'unit_id da evidência (%) difere da execução (%)', NEW.unit_id, ex_unit
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.task_id IS DISTINCT FROM ex_task THEN
    RAISE EXCEPTION 'task_id da evidência (%) difere da execução (%)', NEW.task_id, ex_task
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Restringir execução direta — só triggers usam
REVOKE ALL ON FUNCTION public.check_evidence_execution_consistency() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_evidence_execution_consistency ON public.evidences;
CREATE TRIGGER trg_check_evidence_execution_consistency
  BEFORE INSERT OR UPDATE OF task_execution_id, organization_id, unit_id, task_id
  ON public.evidences
  FOR EACH ROW
  EXECUTE FUNCTION public.check_evidence_execution_consistency();