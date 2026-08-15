import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const RevokeSchema = z.object({
  workspaceId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const Route = createFileRoute('/api/team/invitations/revoke')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        try {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ ok: false, code: 'unauthorized', requestId }), { status: 401 });
          }
          const token = authHeader.split(' ')[1];
          const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
          
          if (authError || !user) {
            return new Response(JSON.stringify({ ok: false, code: 'unauthorized', requestId }), { status: 401 });
          }

          const body = await request.json();
          const result = RevokeSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_input', requestId }), { status: 400 });
          }

          const { workspaceId, invitationId } = result.data;

          // Extra authorization for admin revocation
          const { data: invitation } = await supabaseAdmin
            .from('workspace_invitations')
            .select('role')
            .eq('id', invitationId)
            .eq('workspace_id', workspaceId)
            .single();

          const { data: isOwner } = await supabaseAdmin.rpc('user_has_workspace_access', {
            p_user_id: user.id,
            p_workspace_id: workspaceId,
            p_min_role: 'owner'
          });

          const { data: isAdmin } = await supabaseAdmin.rpc('user_has_workspace_access', {
            p_user_id: user.id,
            p_workspace_id: workspaceId,
            p_min_role: 'admin'
          });

          if (!isAdmin && !isOwner) {
            return new Response(JSON.stringify({ ok: false, code: 'forbidden', requestId }), { status: 403 });
          }

          if (invitation?.role === 'admin' && !isOwner) {
            return new Response(JSON.stringify({ ok: false, code: 'forbidden', requestId }), { status: 403 });
          }

          const { error } = await supabaseAdmin
            .from('workspace_invitations')
            .update({ status: 'revoked', updated_at: new Date().toISOString() })
            .eq('id', invitationId)
            .eq('workspace_id', workspaceId);

          if (error) {
            return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
          }

          return new Response(JSON.stringify({ ok: true, requestId }), { status: 200 });

        } catch (error) {
          console.error('[Invitation-Revoke] Unexpected error:', error);
          return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
        }
      }
    }
  }
});
