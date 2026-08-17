
UPDATE public.checklists 
SET blocks = COALESCE(
    (SELECT jsonb_agg(b)
     FROM jsonb_array_elements(blocks) b
     WHERE b->>'id' != 'pfv4z3xq'),
    '[]'::jsonb
),
updated_at = now()
WHERE id = 'a050976c-d5ed-44a0-af45-791a2c558dd8'
AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(blocks) b WHERE b->>'id' = 'pfv4z3xq'
);
