import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM = "Tieck <notificacao@tieck.com.br>";
const INTERNAL_TO = "rafaelaboonem@gmail.com";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1).max(2000),
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
}) {
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!lovableApiKey || !resendApiKey) {
    throw new Error("Serviço de e-mail não configurado.");
  }
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendApiKey,
    },
    body: JSON.stringify({
      from: FROM,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend error [${res.status}]: ${body}`);
    throw new Error(`Falha ao enviar e-mail (${res.status}).`);
  }
}

export const sendContactEmails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const name = escapeHtml(data.name);
    const email = escapeHtml(data.email);
    const message = escapeHtml(data.message).replace(/\n/g, "<br>");

    const visitorHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#FF007F;margin:0 0 12px">Obrigado pelo contato, ${name}!</h2>
        <p>Recebemos sua mensagem e retornaremos em breve.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
        <p style="color:#475569;font-size:14px"><strong>Sua mensagem:</strong></p>
        <p style="color:#475569;font-size:14px">${message}</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">— Equipe Tieck</p>
      </div>`;

    const internalHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">Novo lead pelo formulário de contato</h2>
        <p><strong>Nome:</strong> ${name}</p>
        <p><strong>E-mail:</strong> ${email}</p>
        <p><strong>Mensagem:</strong></p>
        <p style="background:#f8fafc;padding:12px;border-radius:8px">${message}</p>
      </div>`;

    await Promise.all([
      sendEmail({
        to: data.email,
        subject: "Recebemos sua mensagem — Tieck",
        html: visitorHtml,
      }),
      sendEmail({
        to: INTERNAL_TO,
        subject: `Novo lead: ${data.name}`,
        html: internalHtml,
      }),
    ]);

    return { ok: true as const };
  });