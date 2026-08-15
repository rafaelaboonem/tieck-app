
-- 1. REVOKE DEFAULT PRIVILEGES FROM SENSITIVE RPCS
REVOKE ALL ON FUNCTION public.update_workspace_member_status(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_workspace_invitation_service(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_workspace_member_status(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation_service(text, uuid) TO service_role;
