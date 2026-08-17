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
  completedAt,
  ownerEmail,
  isStillPending
}: {
  assignmentId: string;
  checklistTitle: string;
  workspaceName: string;
  assigneeName: string;
  dueAt: string;
  completedAt?: string | null;
  ownerEmail: string;
  isStillPending: boolean;
}) {
  const resendApiKey = process.env['RESEND_API_KEY'];
  const publicUrl = process.env['PUBLIC_URL'] || 'https://tieck.com.br';

  if (!resendApiKey || !resendApiKey.startsWith('re_')) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString("pt-BR", { 
    timeZone: "America/Sao_Paulo",
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const formattedDueAt = formatDateTime(dueAt);
  const formattedCompletedAt = completedAt ? formatDateTime(completedAt) : null;

  // Tempo de atraso (apenas visual)
  let delayText = "";
  if (!isStillPending && completedAt) {
    const diffMs = new Date(completedAt).getTime() - new Date(dueAt).getTime();
    if (diffMs > 0) {
      const seconds = Math.floor((diffMs / 1000) % 60);
      const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
      const hours = Math.floor((diffMs / (1000 * 60 * 60)));
      
      const parts = [];
      if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
      if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
      if (hours === 0 && minutes === 0 && seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);
      
      if (parts.length > 0) {
        delayText = ` (${parts.join(' e ')} após o prazo)`;
      }
    }
  }

  const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m] || m);

  const cleanSubject = (str: string) => str.replace(/[\r\n\x00-\x1F\x7F]/g, "").slice(0, 255);

  const safeChecklistTitle = escapeHtml(checklistTitle);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeAssigneeName = escapeHtml(assigneeName);

  const subject = cleanSubject(
    isStillPending 
      ? `Prazo não cumprido: ${checklistTitle}` 
      : `Concluído com atraso: ${checklistTitle}`
  );
  
  const title = isStillPending ? "Prazo expirado" : "Checklist concluído com atraso";
  const subtext = isStillPending
    ? "O prazo para conclusão deste checklist expirou e ele ainda está pendente."
    : "O checklist foi concluído, porém após o prazo estabelecido.";
    
  const statusLabel = isStillPending ? "Ainda pendente" : "Concluído com atraso";
  const statusColor = isStillPending ? "#e11d48" : "#d97706"; // Red vs Amber/Orange
  const highlightColor = isStillPending ? "#fef2f2" : "#fffbeb"; // Light red vs light amber
  
  // Ícone visual simplificado
  const iconHtml = isStillPending 
    ? `<span style="font-size: 24px;">⏰ ⚠️</span>`
    : `<span style="font-size: 24px;">✅ ⏰</span>`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
      <div style="padding: 24px 0;">
        <img src="${publicUrl}/email/tieck-logo.png" alt="Tieck" style="width: 120px; margin-bottom: 24px;" />
      </div>
      
      <div style="border-left: 4px solid ${statusColor}; padding-left: 16px; margin-bottom: 24px;">
        <div style="margin-bottom: 8px;">${iconHtml}</div>
        <h1 style="font-size: 24px; font-weight: bold; margin: 0 0 8px 0; color: #111;">${title}</h1>
        <p style="color: #666; font-size: 16px; margin: 0; line-height: 1.5;">${subtext}</p>
      </div>
      
      <div style="background-color: ${highlightColor}; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid ${isStillPending ? '#fee2e2' : '#fef3c7'};">
        <div style="margin-bottom: 16px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Responsável</p>
          <p style="margin: 0; font-size: 16px; font-weight: 600;">${safeAssigneeName}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Prazo</p>
          <p style="margin: 0; font-size: 16px; font-weight: 600;">${formattedDueAt}</p>
        </div>

        ${!isStillPending && formattedCompletedAt ? `
        <div style="margin-bottom: 16px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Concluído em</p>
          <p style="margin: 0; font-size: 16px; font-weight: 600;">${formattedCompletedAt}</p>
        </div>
        ` : ''}
        
        <div>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Status</p>
          <p style="margin: 0; font-size: 16px; color: ${statusColor}; font-weight: bold;">${statusLabel}${delayText}</p>
        </div>
      </div>

      <div style="margin-bottom: 40px;">
        <a href="${publicUrl}/organizar" style="display: inline-block; background-color: #FF007F; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Ver detalhes no painel
        </a>
      </div>
      
      <hr style="border: 0; border-top: 1px solid #eee; margin-bottom: 24px;" />
      <p style="color: #999; font-size: 12px; margin: 0;">
        Workspace: <strong>${safeWorkspaceName}</strong> • Checklist: <strong>${safeChecklistTitle}</strong>
      </p>
      <p style="color: #999; font-size: 12px; margin: 8px 0 0 0;">
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
      'Idempotency-Key': idempotencyKey
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
