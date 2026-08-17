-- Fase 4B.9: Restaura blocos do editor a partir do snapshot publicado para o checklist Casa 2
-- ID: a050976c-d5ed-44a0-af45-791a2c558dd8

UPDATE public.checklists
SET blocks = published_content->'blocks'
WHERE id = 'a050976c-d5ed-44a0-af45-791a2c558dd8'
  AND (blocks IS NULL OR jsonb_array_length(blocks) = 0)
  AND published_content->'blocks' IS NOT NULL
  AND jsonb_array_length(published_content->'blocks') > 0;