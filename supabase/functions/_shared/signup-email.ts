// Shared email helper for signup / e-mail confirmation flows.
// Remetente principal solicitado. Requer o domínio `tieck.com` verificado no Resend.
const FROM_ADDRESS = "Tieck <suporte@tieck.com>";
// Fallbacks usados automaticamente enquanto `tieck.com` não estiver verificado.
const FALLBACK_FROM_CHAIN = [
  "Tieck <suporte@tieck.com.br>",
  "Tieck <notificacao@tieck.com.br>",
  "Tieck <onboarding@resend.dev>",
];
const RESEND_API_URL = "https://connector-gateway.lovable.dev/resend/emails";
const CODE_TTL_MIN = 10;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hashCode(code: string, email: string) {
  return sha256Hex(`${email.toLowerCase()}:${code}`);
}

export function generateCode() {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const n = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
  return String(100000 + (n % 900000));
}

export function generateToken() {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function codeEmailHtml(code: string) {
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:36px;border:1px solid #e2e8f0">
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;font-size:22px;font-weight:800;color:#FF007F;letter-spacing:-0.5px">Tieck</div>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">Bem-vindo(a) à Tieck! 👋</h1>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.55">
      Use o código de 6 dígitos abaixo no aplicativo para concluir seu cadastro:
    </p>
    <div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;background:#fff0f7;padding:20px;border-radius:10px;color:#FF007F;border:1px dashed #FFB3D9">${code}</div>
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.55">
      Este código expira em <strong>${CODE_TTL_MIN} minutos</strong>.
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0" />
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">
      Se você não solicitou este código, pode ignorar este e-mail.
    </p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0">© Tieck · suporte@tieck.com</p>
</body></html>`;
}

function welcomeHtml() {
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:36px;border:1px solid #e2e8f0">
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;font-size:22px;font-weight:800;color:#FF007F;letter-spacing:-0.5px">Tieck</div>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">Cadastro confirmado 🎉</h1>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.55">
      Sua conta foi criada com sucesso. Já pode acessar a Tieck e organizar seus processos.
    </p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0">© Tieck · suporte@tieck.com</p>
</body></html>`;
}

async function postResend(lovableApiKey: string, resendConnectionKey: string, from: string, to: string, subject: string, html: string) {
  return fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendConnectionKey,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const resendConnectionKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableApiKey || !resendConnectionKey) {
    throw new Error("Serviço de e-mail indisponível: conexão Resend não configurada.");
  }

  let lastError = "";
  for (const from of [FROM_ADDRESS, ...FALLBACK_FROM_CHAIN]) {
    const res = await postResend(lovableApiKey, resendConnectionKey, from, to, subject, html);
    if (res.ok) return;
    lastError = await res.text();
    console.error("Resend send failed", from, res.status, lastError);
  }

  throw new Error(`Não foi possível enviar o e-mail. ${lastError}`);
}

export async function sendCodeEmail(to: string, code: string) {
  await sendEmail(to, `Bem-vindo à Tieck! Seu código é ${code}`, codeEmailHtml(code));
}

export async function sendConfirmationCodeEmail(to: string, code: string) {
  await sendEmail(to, `Confirme seu e-mail — código ${code}`, codeEmailHtml(code));
}

export async function sendWelcomeEmail(to: string) {
  try {
    await sendEmail(to, "Bem-vindo(a) à Tieck — cadastro confirmado", welcomeHtml());
  } catch (e) {
    console.error("Welcome email failed", e);
  }
}

export const CODE_TTL_MINUTES = CODE_TTL_MIN;
export const VERIFY_TOKEN_TTL_MINUTES = 15;