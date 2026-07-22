GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_datasets TO authenticated;
GRANT ALL ON public.vision_datasets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_curated_images TO authenticated;
GRANT ALL ON public.vision_curated_images TO service_role;

GRANT SELECT ON public.vision_model_versions TO authenticated;
GRANT ALL ON public.vision_model_versions TO service_role;

GRANT SELECT ON public.vision_model_runs TO authenticated;
GRANT ALL ON public.vision_model_runs TO service_role;

GRANT SELECT ON public.vision_dataset_snapshots TO authenticated;
GRANT ALL ON public.vision_dataset_snapshots TO service_role;

GRANT SELECT ON public.vision_dataset_snapshot_images TO authenticated;
GRANT ALL ON public.vision_dataset_snapshot_images TO service_role;