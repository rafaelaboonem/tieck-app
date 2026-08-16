import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";
const RESEND_API_URL = "https://connector-gateway.lovable.dev/resend/emails";

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
  const lovableApiKey = process.env['LOVABLE_API_KEY'];
  const resendConnectionKey = process.env['RESEND_API_KEY'];
  const publicUrl = process.env['PUBLIC_URL'];

  if (!lovableApiKey || !resendConnectionKey || !publicUrl) {
    console.error('[Email] Missing required environment variables');
    throw new Error('Email service unavailable: missing configuration');
  }

  // Validate PUBLIC_URL fail-closed
  let validatedUrl: URL;
  try {
    validatedUrl = new URL(publicUrl);
    if (validatedUrl.protocol !== 'https:') throw new Error('Protocol must be HTTPS');
    if (validatedUrl.username || validatedUrl.password) throw new Error('URL cannot contain credentials');
    if (validatedUrl.search || validatedUrl.hash) throw new Error('URL cannot contain search params or hash');
  } catch (err) {
    console.error('[Email] Invalid PUBLIC_URL:', publicUrl);
    throw new Error('Internal Configuration Error');
  }

  const cleanPublicUrl = validatedUrl.origin.replace(/\/+$/, '');

  // Fetch true data from DB
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('workspace_invitations')
    .select('email_normalized, role, token_hash, expires_at, status, workspaces(name)')
    .eq('id', invitationId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .single();

  if (inviteError || !invite) {
    console.error('[Email] Invitation not found or not pending:', invitationId, inviteError);
    throw new Error('Invitation not found or invalid status');
  }

  const workspaceData = invite.workspaces as unknown as { name: string } | { name: string }[] | null;
  const workspaceName = (Array.isArray(workspaceData) ? workspaceData[0]?.name : workspaceData?.name) || 'Workspace';
  
  if (new Date(invite.expires_at) < new Date()) {
    throw new Error('Invitation expired');
  }

  // Validate token hash
  const hash = await sha256Hex(token);
  if (hash !== invite.token_hash) {
    throw new Error('Security violation: token mismatch');
  }

  const inviteLink = `${cleanPublicUrl}/convite/${token}`;

  
  const roleMap: Record<string, string> = { 
    admin: 'Administrador', 
    editor: 'Editor', 
    viewer: 'Visualizador' 
  };
  const roleName = roleMap[invite.role] || invite.role;

  // Escaping (simple)
  const escapedWorkspaceName = workspaceName.replace(/[&<>"']/g, (m: string) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[m] || m;
  });

  // Sanitize workspace name for subject
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

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': resendConnectionKey,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [invite.email_normalized],
      subject,
      html,
      text
    }),
  });

  if (!res.ok) {
    let errorDetails = '';
    try {
      // Don't log full response if it's too large, but capture enough for diagnosis
      const text = await res.text();
      errorDetails = text.slice(0, 500);
    } catch (e) {
      errorDetails = 'Could not read error body';
    }

    console.error('[Resend] API Error:', {
      status: res.status,
      requestId: res.headers.get('x-request-id'),
      details: errorDetails
    });
    throw new Error(`Failed to send email via Resend: ${res.status}`);
  }

  return { ok: true };
}
