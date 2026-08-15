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

          // 3. Call atomic RPC (internal logic handles user id)
          const { data, error: rpcError } = await supabaseAdmin.rpc('accept_workspace_invitation', {
            p_token_hash: tokenHash
          });

          if (rpcError) {
            console.error('[Invitation-Accept] RPC error:', rpcError);
            return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
          }

          const res = data?.[0];
          if (!res || !res.success) {
            return new Response(JSON.stringify({ 
              ok: false, 
              code: res?.error_code || 'invitation_failed', 
              requestId 
            }), { status: 400 });
          }

          return new Response(JSON.stringify({ 
            ok: true, 
            workspaceId: res.workspace_id,
            memberId: res.member_id,
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
