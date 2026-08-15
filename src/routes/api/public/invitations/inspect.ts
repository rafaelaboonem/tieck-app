import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const InspectSchema = z.object({
  token: z.string().min(1),
});

export const Route = createFileRoute('/api/public/invitations/inspect')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        try {
          const body = await request.json();
          const result = InspectSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_request', requestId }), { status: 400 });
          }

          const tokenHash = createHash('sha256').update(result.data.token).digest('hex');

          // Query invitation details securely (public route, but specific hash required)
          const { data: invitation, error } = await supabaseAdmin
            .from('workspace_invitations')
            .select(`
              id,
              email_normalized,
              role,
              status,
              expires_at,
              workspace:workspaces(id, name)
            `)
            .eq('token_hash', tokenHash)
            .maybeSingle();

          if (error || !invitation) {
            return new Response(JSON.stringify({ ok: false, code: 'not_found', requestId }), { status: 404 });
          }

          if (invitation.status !== 'pending') {
            return new Response(JSON.stringify({ ok: false, code: 'already_processed', requestId }), { status: 400 });
          }

          if (new Date(invitation.expires_at) < new Date()) {
            return new Response(JSON.stringify({ ok: false, code: 'expired', requestId }), { status: 400 });
          }

          // Return masked email and workspace details
          const [userPart, domainPart] = invitation.email_normalized.split('@');
          const maskedEmail = `${userPart.substring(0, 2)}***@${domainPart}`;

          return new Response(JSON.stringify({
            ok: true,
            invitation: {
              email: maskedEmail,
              role: invitation.role,
              workspaceName: (invitation.workspace as any)?.name
            },
            requestId
          }), { status: 200 });

        } catch (error) {
          console.error('[Invitation-Inspect] Error:', error);
          return new Response(JSON.stringify({ ok: false, code: 'internal_error', requestId }), { status: 500 });
        }
      }
    }
  }
});
