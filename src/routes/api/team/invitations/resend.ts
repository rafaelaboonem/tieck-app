import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const ResendSchema = z.object({
  workspaceId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const Route = createFileRoute('/api/team/invitations/resend')({
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
          const result = ResendSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_input', requestId }), { status: 400 });
          }

          const { workspaceId, invitationId } = result.data;

          // Rate Limit check
          const keyHash = createHash('sha256').update(`resend:${user.id}:${invitationId}`).digest('hex');
          const { data: limitData, error: limitError } = await supabaseAdmin.rpc('hit_public_rate_limit', {
            p_key_hash: keyHash,
            p_action: 'workspace_invite_resend',
            p_window_seconds: 600,
            p_limit: 3
          });
          const allowed = !limitError && Array.isArray(limitData) && limitData[0]?.allowed === true;
          if (!allowed) {
            return new Response(JSON.stringify({ ok: false, code: 'rate_limit', requestId }), { status: 429 });
          }

          const tokenValue = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const { data: email, error: rpcError } = await supabaseAdmin.rpc('resend_workspace_invitation', {
            p_workspace_id: workspaceId,
            p_actor_id: user.id,
            p_invitation_id: invitationId,
            p_new_token_hash: tokenHash,
            p_expires_at: expiresAt.toISOString()
          });

          if (rpcError) {
            const code = rpcError.message.includes('Forbidden') ? 'forbidden' : 'internal_error';
            return new Response(JSON.stringify({ ok: false, code, requestId }), { status: code === 'forbidden' ? 403 : 400 });
          }

          const inviteLink = `${new URL(request.url).origin}/convite/${tokenValue}`;

          return new Response(JSON.stringify({ 
            ok: true, 
            requestId,
            emailSent: false,
            invitation: {
              email,
              token: tokenValue,
              link: inviteLink,
              expiresAt: expiresAt.toISOString()
            }
          }), { status: 200 });

        } catch (error) {
          console.error('[Invitation-Resend] Unexpected error:', error);
          return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
        }
      }
    }
  }
});
