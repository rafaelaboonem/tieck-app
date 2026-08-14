
-- Garantir que a função permite execução para anon, authenticated e service_role,
-- mas bloqueia para PUBLIC (o que inclui qualquer papel não explicitamente concedido).

REVOKE ALL ON FUNCTION public.create_public_response(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_response(uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_public_response IS 'Cria uma sessão anônima para preenchimento de um checklist publicado. Acesso permitido para anon, authenticated e service_role.';
