import { createClient } from "@supabase/supabase-js";
import { 
  sha256Hex, 
  hashCode, 
  generateCode, 
  generateToken,
  CODE_TTL_MINUTES,
  VERIFY_TOKEN_TTL_MINUTES
} from "../../../supabase/functions/_shared/signup-email";

// Helper to get Supabase Admin client
function getAdmin() {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(supabaseUrl, serviceKey);
}

// Resend setup (reusing logic from edge functions logic conceptually)
const RESEND_API_URL = "https://connector-gateway.lovable.dev/resend/emails";
const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";

async function sendEmail(to: string, subject: string, html: string) {
  const lovableApiKey = process.env['LOVABLE_API_KEY'];
  const resendConnectionKey = process.env['RESEND_API_KEY'];
  if (!lovableApiKey || !resendConnectionKey) {
    console.error("Resend keys missing for recovery email");
    return; // Don't crash but email won't be sent
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendConnectionKey,
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Resend send failed", res.status, errorBody);
  }
}

function resetEmailHtml(code: string) {
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:36px;border:1px solid #e2e8f0">
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;font-size:22px;font-weight:800;color:#FF007F;letter-spacing:-0.5px">Tieck</div>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">Redefina sua senha</h1>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.55">
      Recebemos uma solicitação para redefinir a senha da sua conta Tieck. Use o código abaixo:
    </p>
    <div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;background:#fff0f7;padding:20px;border-radius:10px;color:#FF007F;border:1px dashed #FFB3D9">${code}</div>
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.55">
      Este código expira em <strong>10 minutos</strong>.
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0" />
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">
      Se você não solicitou a redefinição, pode ignorar este e-mail.
    </p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0">© Tieck · suporte@tieck.com.br</p>
</body></html>`;
}

export async function requestPasswordReset(email: string) {
  const admin = getAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  // Find user via RPC
  const { data: userId, error: findError } = await admin.rpc('get_user_id_by_email', { p_email: normalizedEmail });
  
  if (findError || !userId) {
    // Reveal nothing to frontend
    return { ok: true };
  }

  const code = generateCode();
  const codeHash = await hashCode(code, normalizedEmail);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  // Invalidate previous codes
  await admin.from('password_reset_codes').delete().eq('user_id', userId).eq('consumed_at', null);

  const { error: insertErr } = await admin.from('password_reset_codes').insert({
    user_id: userId,
    email_normalized: normalizedEmail,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("Insert reset code error", insertErr);
    throw new Error("Failed to generate reset code");
  }

  await sendEmail(normalizedEmail, "Redefina sua senha Tieck", resetEmailHtml(code));

  return { ok: true };
}

export async function verifyPasswordReset(email: string, code: string) {
  const admin = getAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: rows, error } = await admin
    .from("password_reset_codes")
    .select("*")
    .eq("email_normalized", normalizedEmail)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error("Failed to verify code");
  const row = rows?.[0];

  if (!row) throw new Error("code is invalid");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("otp has expired");
  if (row.attempts >= 5) throw new Error("too many requests");

  const expected = await hashCode(code, normalizedEmail);
  if (row.code_hash !== expected) {
    await admin.from("password_reset_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    throw new Error("code is invalid");
  }

  const resetToken = generateToken();
  const resetTokenHash = await sha256Hex(resetToken);
  
  const { error: updateErr } = await admin
    .from("password_reset_codes")
    .update({
      verified_at: new Date().toISOString(),
      verification_token_hash: resetTokenHash,
      verification_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .eq("id", row.id);

  if (updateErr) throw new Error("Failed to confirm code");

  return { ok: true, resetToken };
}

export async function completePasswordReset(email: string, resetToken: string, newPassword: string) {
  const admin = getAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = await sha256Hex(resetToken);

  // Atomic check and consume
  const { data: row, error: selectErr } = await admin
    .from("password_reset_codes")
    .select("*")
    .eq("email_normalized", normalizedEmail)
    .eq("verification_token_hash", tokenHash)
    .is("consumed_at", null)
    .single();

  if (selectErr || !row) throw new Error("invalid token");
  if (new Date(row.verification_expires_at).getTime() < Date.now()) throw new Error("token has expired");
  if (!row.verified_at) throw new Error("invalid token");

  // Consume token first (atomic-ish since it's one row)
  const { error: consumeErr } = await admin
    .from("password_reset_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (consumeErr) throw new Error("token already used");

  // Update auth password
  const { error: authErr } = await admin.auth.admin.updateUserById(row.user_id, {
    password: newPassword,
  });

  if (authErr) {
    // Rollback consumed_at if auth fails? 
    // Instruction says "Avoid reset token reusable... avoid loss unjustified".
    // If Admin API fails, user might be stuck. 
    await admin.from("password_reset_codes").update({ consumed_at: null }).eq("id", row.id);
    throw authErr;
  }

  return { ok: true };
}
