import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export type ResendDiagnosticCode = 
  | 'configuration_invalid'
  | 'public_url_invalid'
  | 'invitation_query_failed'
  | 'invitation_not_pending'
  | 'invitation_expired'
  | 'token_hash_mismatch'
  | 'payload_build_failed'
  | 'abort_controller_failed'
  | 'fetch_started'
  | 'fetch_failed'
  | 'fetch_response'
  | 'resend_non_2xx'
  | 'unexpected_error';

export type ResendDiagnosticType = 
  | 'Error'
  | 'AbortError'
  | 'TypeError'
  | 'SyntaxError'
  | 'DBError'
  | 'ConfigError';

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

  const allowedCodes: ResendDiagnosticCode[] = [
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
    'fetch_response',
    'resend_non_2xx'
  ];

  const logSecure = (currentStage: string, code: ResendDiagnosticCode, type: ResendDiagnosticType, extra?: Record<string, unknown>) => {
    const safeCode = allowedCodes.includes(code) ? code : 'unexpected_error';
    console.error('[Resend] Diagnostic', {
      stage: currentStage,
      code: safeCode,
      type,
      sha: shaPrefix,
      ...extra
    });
  };

  try {
    stage = 'configuration_check';
    const isResendKeyPresent = !!resendApiKey;
    const isResendKeyFormatValid = typeof resendApiKey === 'string' && resendApiKey.startsWith('re_');
    const isPublicUrlPresent = !!publicUrl;

    if (!isResendKeyPresent || !isResendKeyFormatValid || !isPublicUrlPresent) {
      logSecure(stage, 'configuration_invalid', 'ConfigError');
      throw new Error('Email service unavailable: missing configuration');
    }

    stage = 'public_url_validation';
    let validatedUrl: URL;
    try {
      validatedUrl = new URL(publicUrl);
      if (validatedUrl.protocol !== 'https:') throw new Error('Protocol must be HTTPS');
      if (validatedUrl.username || validatedUrl.password) throw new Error('URL cannot contain credentials');
      if (validatedUrl.search || validatedUrl.hash) throw new Error('URL cannot contain search params or hash');
    } catch (err) {
      logSecure(stage, 'public_url_invalid', err instanceof TypeError ? 'TypeError' : 'Error');
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
      logSecure(stage, 'invitation_query_failed', 'DBError');
      throw new Error('Invitation not found');
    }

    if (invite.status !== 'pending') {
      logSecure(stage, 'invitation_not_pending', 'Error');
      throw new Error('Invitation not pending');
    }

    if (new Date(invite.expires_at) < new Date()) {
      logSecure(stage, 'invitation_expired', 'Error');
      throw new Error('Invitation expired');
    }

    stage = 'token_hash_validation';
    const hash = await sha256Hex(token);
    if (hash !== invite.token_hash) {
      logSecure(stage, 'token_hash_mismatch', 'Error');
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

    let res: Response | null = null;
    try {
      stage = 'fetch_started';
      res = await fetch(RESEND_API_URL, {
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
    } catch (fetchErr: unknown) {
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      logSecure(
        stage, 
        isAbort ? 'abort_controller_failed' : 'fetch_failed', 
        isAbort ? 'AbortError' : (fetchErr instanceof TypeError ? 'TypeError' : 'Error')
      );
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      logSecure(stage, 'resend_non_2xx', 'Error', {
        status: res.status,
        requestId: res.headers.get('x-request-id')?.slice(0, 64) || null
      });
      throw new Error(`Failed to send email via Resend: ${res.status}`);
    }

    return { ok: true };
  } catch (err: unknown) {
    // Already logged internally if one of the monitored stages
    throw err;
  }
}
