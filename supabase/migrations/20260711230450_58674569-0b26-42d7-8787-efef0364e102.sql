
ALTER TYPE public.execution_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE public.task_executions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS active_from timestamptz NOT NULL DEFAULT now();
