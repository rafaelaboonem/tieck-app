import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export async function sendOverdueAssignmentEmail({
  assignmentId,
  checklistTitle,
  workspaceName,
  assigneeName,
  dueAt,
  ownerEmail,
  isStillPending
}: {
  assignmentId: string;
  checklistTitle: string;
  workspaceName: string;
  assigneeName: string;
  dueAt: string;
  ownerEmail: string;
  isStillPending: boolean;
}) {
  const resendApiKey = process.env['RESEND_API_KEY'];
  const publicUrl = process.env['PUBLIC_URL'] || 'https://tieck.com.br';

  if (!resendApiKey || !resendApiKey.startsWith('re_')) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const formattedDueAt = new Date(dueAt).toLocaleString("pt-BR", { 
    timeZone: "America/Sao_Paulo",
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const subject = `Prazo não cumprido: ${checklistTitle}`;
  const statusMessage = isStillPending 
    ? "O checklist ainda está pendente de execução." 
    : "O checklist foi concluído, mas após o prazo estabelecido.";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <img src="${publicUrl}/email/tieck-logo.png" alt="Tieck" style="width: 120px; margin-bottom: 24px;" />
      <h1 style="font-size: 20px; color: #111; margin-bottom: 16px;">Atenção: Prazo expirado</h1>
      <p style="color: #666; font-size: 16px; line-height: 24px;">
        Informamos que o prazo para a execução do checklist <strong>${checklistTitle}</strong> no workspace <strong>${workspaceName}</strong> não foi cumprido.
      </p>
      
      <div style="background-color: #f9f9f9; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Responsável</p>
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #111; font-weight: bold;">${assigneeName}</p>
        
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Prazo Original</p>
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #111; font-weight: bold;">${formattedDueAt}</p>
        
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Status Atual</p>
        <p style="margin: 0; font-size: 16px; color: #e11d48; font-weight: bold;">${statusMessage}</p>
      </div>

      <a href="${publicUrl}/organizar" style="display: inline-block; background-color: #FF007F; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
        Ver detalhes no painel
      </a>
      
      <hr style="border: 0; border-top: 1px solid #eee; margin: 32px 0;" />
      <p style="color: #999; font-size: 12px;">
        Este é um alerta automático do Tieck.
      </p>
    </div>
  `;

  // Idempotency key: assignmentId + dueAt (so if dueAt changes, it can notify again)
  const idempotencyKey = await sha256Hex(`${assignmentId}:${dueAt}`);

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: ownerEmail,
      subject: subject,
      html: html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
