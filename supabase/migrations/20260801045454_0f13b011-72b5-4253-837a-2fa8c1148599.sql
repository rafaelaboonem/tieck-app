UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE email = 'labtest+v3@tieck.com.br';

INSERT INTO public.workspaces (id, name, owner_id)
SELECT '00000000-0000-4000-8000-0000000010be'::uuid, 'Lab Test V3', id FROM auth.users WHERE email = 'labtest+v3@tieck.com.br'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.visual_standards (id, workspace_id, created_by, name, question, status)
SELECT '00000000-0000-4000-8000-0000000010bf'::uuid, '00000000-0000-4000-8000-0000000010be'::uuid, id,
       'Teste V3 - lixeira', 'A lixeira deve estar vazia e com a tampa fechada', 'draft'
FROM auth.users WHERE email = 'labtest+v3@tieck.com.br'
ON CONFLICT (id) DO NOTHING;