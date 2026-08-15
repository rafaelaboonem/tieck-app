import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const InviteSchema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().email().transform(e => e.toLowerCase().trim()),
  role: z.enum(['admin', 'editor', 'viewer']),
});

export const Route = createFileRoute('/api/public/invitations/create')({
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
          const result = InviteSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_input', requestId }), { status: 400 });
          }
          const { workspaceId, email, role } = result.data;

          // Rate Limit check
          const keyHash = createHash('sha256').update(`invite:${user.id}:${workspaceId}`).digest('hex');
          const { data: limitData, error: limitError } = await supabaseAdmin.rpc('hit_public_rate_limit', {
            p_key_hash: keyHash,
            p_action: 'workspace_invite',
            p_window_seconds: 600, // 10 minutes
            p_limit: 5 // fail-closed
          });

          const allowed = !limitError && Array.isArray(limitData) && limitData[0]?.allowed === true;
          if (!allowed) {
            return new Response(JSON.stringify({ ok: false, code: 'rate_limit', requestId }), { status: 429 });
          }

          // Generate token and hash
          const tokenValue = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          // Create invitation via atomic service RPC
          const { data: invitationId, error: inviteError } = await supabaseAdmin.rpc('create_workspace_invitation_safe', {
            p_workspace_id: workspaceId,
            p_invited_by: user.id,
            p_email_normalized: email,
            p_role: role,
            p_token_hash: tokenHash,
            p_expires_at: expiresAt.toISOString()
          });

          if (inviteError) {
            console.error('[Invitation-Create] RPC error:', inviteError);
            const msg = inviteError.message;
            const errorCode = msg.includes('Forbidden') ? 'forbidden' : 
                             msg.includes('Conflict') ? 'already_member' :
                             'internal_error';
            return new Response(JSON.stringify({ ok: false, code: errorCode, requestId }), { 
              status: errorCode === 'forbidden' ? 403 : (errorCode === 'already_member' ? 409 : 500) 
            });
          }

          const inviteLink = `${new URL(request.url).origin}/convite/${tokenValue}`;
          
          return new Response(JSON.stringify({ 
            ok: true, 
            requestId,
            emailSent: false,
            invitation: {
              id: invitationId,
              email,
              role,
              token: tokenValue,
              link: inviteLink,
              expiresAt: expiresAt.toISOString()
            }
          }), { status: 200 });

        } catch (error) {
          console.error('[Invitation-Create] Unexpected error:', error);
          return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
        }
      }
    }
  }
});
