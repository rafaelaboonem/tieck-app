
create or replace function public.get_checklist_access(p_checklist_id uuid, p_user_id uuid)
returns table (
  workspace_id uuid,
  owner_id uuid,
  is_owner boolean,
  member_role public.app_role,
  can_manage boolean
) 
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    c.workspace_id,
    c.user_id as owner_id,
    (c.user_id = p_user_id) as is_owner,
    m.role as member_role,
    (c.user_id = p_user_id or m.role in ('owner', 'admin', 'editor')) as can_manage
  from public.checklists c
  left join public.workspace_members m on m.workspace_id = c.workspace_id and m.user_id = p_user_id and m.status = 'active'
  where c.id = p_checklist_id;
end;
$$;

grant execute on function public.get_checklist_access(uuid, uuid) to authenticated;
grant execute on function public.get_checklist_access(uuid, uuid) to service_role;

-- RLS para camera-references
-- Permitimos que a service_role (usada no backend assinado) faça tudo
-- Usuários autenticados não precisam de acesso direto via storage client, 
-- pois usaremos endpoints assinado/preview, mas adicionamos para consistência se necessário.
-- No entanto, a regra diz "Owner pode upload", "Admin pode upload", etc.
-- Faremos o upload via endpoint server-side, então a service_role é suficiente.
