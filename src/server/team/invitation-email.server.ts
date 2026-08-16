import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export type EmailDiagnosticStage = 
  | 'init'
  | 'config_validation'
  | 'token_hash'
  | 'invitation_query'
  | 'token_comparison'
  | 'payload_build'
  | 'idempotency_hash'
  | 'fetch_started'
  | 'fetch_response';

export type EmailDiagnosticCode = 
  | 'configuration_invalid'
  | 'public_url_invalid'
  | 'invitation_query_failed'
  | 'invitation_not_pending'
  | 'invitation_expired'
  | 'token_hash_mismatch'
  | 'payload_build_failed'
  | 'fetch_failed'
  | 'resend_non_2xx'
  | 'abort_error'
  | 'unclassified_failure';

export type EmailDiagnosticType = 'internal' | 'external' | 'config' | 'security';

export class EmailDeliveryError extends Error {
  constructor(
    public diagnostic: {
      stage: EmailDiagnosticStage;
      code: EmailDiagnosticCode;
      type: EmailDiagnosticType;
      providerStatus?: number;
      requestId?: string | null;
    }
  ) {
    super(`Email delivery failed: ${diagnostic.code} at ${diagnostic.stage}`);
    this.name = 'EmailDeliveryError';
  }
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
  let stage: EmailDiagnosticStage = 'init';
  const shaPrefix = (process.env['VERCEL_GIT_COMMIT_SHA'] || 'unknown').slice(0, 12);
  const resendApiKey = process.env['RESEND_API_KEY'];
  const publicUrl = process.env['PUBLIC_URL'];

  const logSecure = (diag: EmailDeliveryError['diagnostic']) => {
    console.error('[Resend] Diagnostic', {
      stage: diag.stage,
      code: diag.code,
      type: diag.type,
      sha: shaPrefix,
      providerStatus: diag.providerStatus,
      requestId: diag.requestId
    });
  };

  try {
    stage = 'config_validation';
    if (!resendApiKey || !resendApiKey.startsWith('re_') || !publicUrl) {
      throw new EmailDeliveryError({ stage, code: 'configuration_invalid', type: 'config' });
    }

    let validatedUrl: URL;
    try {
      validatedUrl = new URL(publicUrl);
      if (validatedUrl.protocol !== 'https:' || validatedUrl.username || validatedUrl.password || validatedUrl.search || validatedUrl.hash) {
        throw new Error('Invalid URL structure');
      }
    } catch {
      throw new EmailDeliveryError({ stage, code: 'public_url_invalid', type: 'config' });
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
      throw new EmailDeliveryError({ stage, code: 'invitation_query_failed', type: 'internal' });
    }

    if (invite.status !== 'pending') {
      throw new EmailDeliveryError({ stage, code: 'invitation_not_pending', type: 'security' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      throw new EmailDeliveryError({ stage, code: 'invitation_expired', type: 'security' });
    }

    stage = 'token_comparison';
    const hash = await sha256Hex(token);
    if (hash !== invite.token_hash) {
      throw new EmailDeliveryError({ stage, code: 'token_hash_mismatch', type: 'security' });
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

    stage = 'idempotency_hash';
    const idempotencyKey = `tieck-invite-${invitationId}-${hash.slice(0, 16)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let res: Response;
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
      throw new EmailDeliveryError({ 
        stage, 
        code: isAbort ? 'abort_error' : 'fetch_failed', 
        type: 'external' 
      });
    } finally {
      clearTimeout(timeoutId);
    }

    stage = 'fetch_response';
    if (!res.ok) {
      throw new EmailDeliveryError({ 
        stage, 
        code: 'resend_non_2xx', 
        type: 'external',
        providerStatus: res.status,
        requestId: res.headers.get('x-request-id')?.slice(0, 64) || null
      });
    }

    return { ok: true };
  } catch (err: unknown) {
    if (err instanceof EmailDeliveryError) {
      logSecure(err.diagnostic);
      throw err;
    }
    
    const unclassifiedDiag: EmailDeliveryError['diagnostic'] = {
      stage,
      code: 'unclassified_failure',
      type: 'internal'
    };
    logSecure(unclassifiedDiag);
    throw new EmailDeliveryError(unclassifiedDiag);
  }
}