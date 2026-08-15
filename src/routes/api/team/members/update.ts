import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const UpdateSchema = z.object({
  workspaceId: z.string().uuid(),
  memberId: z.string().uuid(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const Route = createFileRoute('/api/team/members/update')({
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
          const result = UpdateSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_input', requestId }), { status: 400 });
          }

          const { workspaceId, memberId, role, status } = result.data;

          // Call hardened service RPC
          const { error: rpcError } = await supabaseAdmin.rpc('update_workspace_member_status', {
            p_workspace_id: workspaceId,
            p_actor_id: user.id,
            p_member_id: memberId,
            p_status: status || 'active',
            p_role: role
          });

          if (rpcError) {
            console.error('[Team-Update] RPC error:', rpcError);
            const msg = rpcError.message;
            const code = msg.includes('Forbidden') ? 'forbidden' : 'internal_error';
            return new Response(JSON.stringify({ ok: false, code, requestId }), { 
              status: code === 'forbidden' ? 403 : 400 
            });
          }

          return new Response(JSON.stringify({ ok: true, requestId }), { status: 200 });

        } catch (error) {
          console.error('[Team-Update] Unexpected error:', error);
          return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
        }
      }
    }
  }
});
