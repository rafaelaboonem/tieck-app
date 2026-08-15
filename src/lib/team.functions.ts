import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const MemberActionSchema = z.object({
  workspaceId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  invitationId: z.string().uuid().optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const updateMemberStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => MemberActionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { getRequest } = await import('@tanstack/react-start/server');
    const request = getRequest()!;
    
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('unauthorized');
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error('unauthorized');

    if (data.memberId) {
      const { error } = await supabaseAdmin.rpc('update_workspace_member_status', {
        p_workspace_id: data.workspaceId,
        p_member_id: data.memberId,
        p_status: data.status || 'active',
        p_role: data.role
      });
      if (error) {
        console.error('[updateMemberStatus] Error:', error);
        throw new Error('forbidden');
      }
    }

    return { ok: true };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ workspaceId: z.string().uuid(), invitationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { getRequest } = await import('@tanstack/react-start/server');
    const request = getRequest()!;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { data: isAuthorized } = await supabaseAdmin.rpc('user_has_workspace_access', {
      p_user_id: user.id,
      p_workspace_id: data.workspaceId,
      p_min_role: 'admin'
    });
    if (!isAuthorized) throw new Error('Forbidden');

    const { error } = await supabaseAdmin
      .from('workspace_invitations')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', data.invitationId)
      .eq('workspace_id', data.workspaceId);

    if (error) throw error;
    return { ok: true };
  });
