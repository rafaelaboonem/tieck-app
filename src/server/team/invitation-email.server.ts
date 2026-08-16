import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export async function sendWorkspaceInvitationEmail({
  invitationId,
  workspaceId,
  token
}: {
  invitationId: string;
  workspaceId: string;
  token: string;
}) {
  let stage = 'init';
  const shaPrefix = (process.env['VERCEL_GIT_COMMIT_SHA'] || 'unknown').slice(0, 12);
  const resendApiKey = process.env['RESEND_API_KEY'];
  const publicUrl = process.env['PUBLIC_URL'];

  const allowedErrorCodes = [
    'configuration_invalid',
    'public_url_invalid',
    'invitation_query_failed',
    'invitation_not_pending',
    'invitation_expired',
    'token_hash_mismatch',
    'payload_build_failed',
    'abort_controller_failed',
    'fetch_started',
    'fetch_failed',
    'resend_non_2xx'
  ];

  const logSecureError = (currentStage: string, errorCode: string, error: any) => {
    const code = allowedErrorCodes.includes(errorCode) ? errorCode : 'unexpected_error';
    console.error(`[Resend] Diagnostic: stage=${currentStage} code=${code} type=${error?.name || 'Error'} sha=${shaPrefix}`);
  };

  try {
    stage = 'configuration_check';
    const isResendKeyPresent = !!resendApiKey;
    const isResendKeyFormatValid = typeof resendApiKey === 'string' && resendApiKey.startsWith('re_');
    const isPublicUrlPresent = !!publicUrl;

    if (!isResendKeyPresent || !isResendKeyFormatValid || !isPublicUrlPresent) {
      const err = new Error('Email service unavailable: missing configuration');
      logSecureError(stage, 'configuration_invalid', err);
      throw err;
    }

    stage = 'public_url_validation';
    let validatedUrl: URL;
    try {
      validatedUrl = new URL(publicUrl!);
      if (validatedUrl.protocol !== 'https:') throw new Error('Protocol must be HTTPS');
      if (validatedUrl.username || validatedUrl.password) throw new Error('URL cannot contain credentials');
      if (validatedUrl.search || validatedUrl.hash) throw new Error('URL cannot contain search params or hash');
    } catch (err) {
      logSecureError(stage, 'public_url_invalid', err);
      throw new Error('Internal Configuration Error');
    }

    const cleanPublicUrl = validatedUrl.origin.replace(/\/+$/, '');

    stage = 'invitation_query';
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('workspace_invitations')
      .select('email_normalized, role, token_hash, expires_at, status, workspaces(name)')
      .eq('id', invitationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (inviteError || !invite) {
      logSecureError(stage, 'invitation_query_failed', inviteError || new Error('Invite not found'));
      throw new Error('Invitation not found');
    }

    if (invite.status !== 'pending') {
      logSecureError(stage, 'invitation_not_pending', new Error(`Status: ${invite.status}`));
      throw new Error('Invitation not pending');
    }

    if (new Date(invite.expires_at) < new Date()) {
      logSecureError(stage, 'invitation_expired', new Error('Expired'));
      throw new Error('Invitation expired');
    }

    stage = 'token_hash_validation';
    const hash = await sha256Hex(token);
    if (hash !== invite.token_hash) {
      logSecureError(stage, 'token_hash_mismatch', new Error('Mismatch'));
      throw new Error('Security violation: token mismatch');
    }

    stage = 'payload_build';
    const workspaceData = invite.workspaces as unknown as { name: string } | { name: string }[] | null;
    const workspaceName = (Array.isArray(workspaceData) ? workspaceData[0]?.name : workspaceData?.name) || 'Workspace';
    const inviteLink = `${cleanPublicUrl}/convite/${token}`;
    const roleMap: Record<string, string> = { 
      admin: 'Administrador', 
      editor: 'Editor', 
      viewer: 'Visualizador' 
    };
    const roleName = roleMap[invite.role] || invite.role;
    const escapedWorkspaceName = workspaceName.replace(/[&<>"']/g, (m: string) => {
      const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[m] || m;
    });
    const sanitizedWorkspaceName = workspaceName.replace(/[\r\n\x00-\x1F\x7F]/g, '').slice(0, 100);
    const subject = `Você foi convidado para o workspace ${sanitizedWorkspaceName} no Tieck`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; padding: 20px; color: #333;">
        <div style="max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #ec4899;">Tieck</h2>
          <p>Olá,</p>
          <p>Você foi convidado para participar do workspace <strong>${escapedWorkspaceName}</strong> no Tieck como <strong>${roleName}</strong>.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${inviteLink}" style="background-color: #ec4899; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Aceitar convite</a>
          </div>
          <p style="font-size: 12px; color: #666;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
          <p style="font-size: 12px; color: #666; word-break: break-all;">${inviteLink}</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 11px; color: #999;">Este convite expira em 7 dias. Se você não esperava este convite, pode ignorar este e-mail.</p>
          <p style="font-size: 11px; color: #999;">Tieck · suporte@tieck.com.br</p>
        </div>
      </body>
      </html>
    `;
    const text = `Você foi convidado para o workspace ${workspaceName} no Tieck como ${roleName}. Aceite o convite aqui: ${inviteLink}`;
    const idempotencyKey = `tieck-invite-${invitationId}-${hash.slice(0, 16)}`;

    stage = 'abort_controller_setup';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      stage = 'fetch_started';
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
          'User-Agent': 'Tieck/1.0',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [invite.email_normalized],
          subject,
          html,
          text
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const err = new Error(`Failed to send email via Resend: ${res.status}`);
        logSecureError(stage, 'resend_non_2xx', err);
        throw err;
      }

      return { ok: true };
    } catch (fetchErr: any) {
      if (fetchErr?.name === 'AbortError') {
        logSecureError(stage, 'abort_controller_failed', fetchErr);
      } else {
        logSecureError(stage, 'fetch_failed', fetchErr);
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    // Already logged internally if one of the monitored stages
    throw err;
  }
}