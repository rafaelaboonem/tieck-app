import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const AcceptSchema = z.object({
  token: z.string().min(1),
});

export const Route = createFileRoute('/api/public/invitations/accept')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        try {
          // 1. Authenticate user
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ ok: false, code: 'unauthorized', requestId }), { status: 401 });
          }
          const authToken = authHeader.split(' ')[1];
          const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authToken);
          
          if (authError || !user) {
            return new Response(JSON.stringify({ ok: false, code: 'unauthorized', requestId }), { status: 401 });
          }

          // 2. Validate token
          const body = await request.json();
          const result = AcceptSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_token', requestId }), { status: 400 });
          }
          
          const tokenHash = createHash('sha256').update(result.data.token).digest('hex');

          // 3. Call atomic RPC (internal service logic handles user id and email matching)
          const { data, error: rpcError } = await supabaseAdmin.rpc('accept_workspace_invitation_service', {
            p_token_hash: tokenHash,
            p_user_id: user.id
          });

          if (rpcError) {
            console.error('[Invitation-Accept] RPC error:', rpcError);
            const rpcMsg = rpcError.message;
            const code = rpcMsg === 'invalid_token' ? 'invalid_token' : 
                         rpcMsg === 'email_mismatch' ? 'email_mismatch' : 
                         'internal_error';
            return new Response(JSON.stringify({ ok: false, code, requestId }), { 
              status: code === 'internal_error' ? 500 : 400 
            });
          }

          const res = data as { ok: boolean; workspace_id: string; member_id: string };
          return new Response(JSON.stringify({ 
            ok: true, 
            workspaceId: res?.workspace_id,
            requestId 
          }), { status: 200 });

        } catch (error) {
          console.error('[Invitation-Accept] Unexpected error:', error);
          return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
        }
      }
    }
  }
});
