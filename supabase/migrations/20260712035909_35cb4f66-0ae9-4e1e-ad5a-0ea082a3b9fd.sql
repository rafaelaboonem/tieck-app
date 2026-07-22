
CREATE TABLE public.vision_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  normal_instructions text,
  anomaly_instructions text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_datasets TO authenticated;
GRANT ALL ON public.vision_datasets TO service_role;

ALTER TABLE public.vision_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY vision_datasets_auth_select ON public.vision_datasets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY vision_datasets_auth_insert ON public.vision_datasets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY vision_datasets_auth_update ON public.vision_datasets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY vision_datasets_auth_delete ON public.vision_datasets
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_vision_datasets_updated_at
  BEFORE UPDATE ON public.vision_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed piloto "bancada-limpa" para preservar dados já enviados
INSERT INTO public.vision_datasets (slug, name, description, normal_instructions, anomaly_instructions)
VALUES (
  'bancada-limpa',
  'Bancada Limpa',
  'Dataset piloto para detecção visual de bancada limpa.',
  'Bancada organizada, sem sujeira, sem objetos fora do lugar.',
  'Bancada suja, com objetos indevidos, resíduos ou desorganização.'
)
ON CONFLICT (slug) DO NOTHING;
