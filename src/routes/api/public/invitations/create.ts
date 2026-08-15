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
          // 1. Authenticate user via Bearer token
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ ok: false, code: 'unauthorized', requestId }), { status: 401 });
          }
          const token = authHeader.split(' ')[1];
          const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
          
          if (authError || !user) {
            return new Response(JSON.stringify({ ok: false, code: 'unauthorized', requestId }), { status: 401 });
          }

          // 2. Parse and validate input
          const body = await request.json();
          const result = InviteSchema.safeParse(body);
          if (!result.success) {
            return new Response(JSON.stringify({ ok: false, code: 'invalid_input', requestId }), { status: 400 });
          }
          const { workspaceId, email, role } = result.data;

          // 3. Authorization check (admin or owner)
          // Use user_has_workspace_access with explicit role requirements
          const { data: isAuthorized, error: roleError } = await supabaseAdmin.rpc('user_has_workspace_access', {
            p_user_id: user.id,
            p_workspace_id: workspaceId,
            p_min_role: 'admin'
          });

          // Wait, the requirement says:
          // Admin can invite editor/viewer.
          // Owner can invite admin.
          // We need to check if the user is owner if role == 'admin'.
          const { data: workspace } = await supabaseAdmin
            .from('workspaces')
            .select('owner_id')
            .eq('id', workspaceId)
            .single();

          const isOwner = workspace?.owner_id === user.id;
          const isAdmin = isAuthorized === true;

          if (role === 'admin' && !isOwner) {
            return new Response(JSON.stringify({ ok: false, code: 'forbidden_role', requestId }), { status: 403 });
          }
          if (role !== 'admin' && !isAdmin && !isOwner) {
            return new Response(JSON.stringify({ ok: false, code: 'forbidden', requestId }), { status: 403 });
          }

          // 4. Rate Limit
          const keyHash = createHash('sha256').update(`invite:${user.id}:${workspaceId}`).digest('hex');
          const { data: limitData, error: limitError } = await supabaseAdmin.rpc('hit_public_rate_limit', {
            p_key_hash: keyHash,
            p_action: 'workspace_invite',
            p_window_seconds: 3600, // 1 hour
            p_limit: 20 // 20 invites per hour
          });

          const allowed = !limitError && Array.isArray(limitData) && limitData[0]?.allowed === true;
          if (!allowed) {
            return new Response(JSON.stringify({ ok: false, code: 'rate_limit', requestId }), { status: 429 });
          }

          // 5. Check if already active member
          const { data: existingMember } = await supabaseAdmin
            .from('workspace_members')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('email_normalized', email)
            .eq('status', 'active')
            .maybeSingle();

          if (existingMember) {
            return new Response(JSON.stringify({ ok: false, code: 'already_member', requestId }), { status: 400 });
          }

          // 6. Generate token and hash
          const tokenValue = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          // 7. Create invitation
          const { error: inviteError } = await supabaseAdmin
            .from('workspace_invitations')
            .upsert({
              workspace_id: workspaceId,
              email_normalized: email,
              role,
              token_hash: tokenHash,
              status: 'pending',
              invited_by: user.id,
              expires_at: expiresAt.toISOString()
            }, { 
              onConflict: 'workspace_id,email_normalized',
              ignoreDuplicates: false // We want to overwrite existing pending invitation
            });

          if (inviteError) {
            console.error('[Invitation-Create] Database error:', inviteError);
            return new Response(JSON.stringify({ ok: false, code: 'database_error', requestId }), { status: 500 });
          }

          // 8. Return success and token (for copy-link fallback)
          return new Response(JSON.stringify({ 
            ok: true, 
            requestId,
            invitation: {
              email,
              role,
              token: tokenValue,
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
