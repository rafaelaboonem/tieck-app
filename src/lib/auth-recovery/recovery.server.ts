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

const FROM_ADDRESS = "Tieck <suporte@tieck.com.br>";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sendRecoveryEmail(to: string, code: string) {
  const resendApiKey = process.env['RESEND_API_KEY'];
  if (!resendApiKey) {
    console.error("[Recovery] RESEND_API_KEY is missing");
    throw new Error("Email provider not configured");
  }

  const subject = "Redefina sua senha Tieck";
  const html = `<!doctype html>
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({ 
        from: FROM_ADDRESS, 
        to: [to], 
        subject, 
        html,
        text: `Seu código de recuperação Tieck: ${code}`
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Resend non-2xx: ${res.status}`);
    }
  } catch (err: any) {
    const isAbort = err.name === 'AbortError';
    console.error("[Recovery] Email fetch failed:", isAbort ? 'timeout' : err.message);
    throw new Error(isAbort ? "Timeout sending email" : "Failed to send email");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestPasswordReset(email: string) {
  const admin = getAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: userId, error: findError } = await admin.rpc('get_user_id_by_email', { p_email: normalizedEmail });
  
  if (findError || !userId) {
    return { ok: true };
  }

  // Cooldown server-side 60s
  const { data: recentCode } = await admin
    .from('password_reset_codes')
    .select('last_sent_at')
    .eq('user_id', userId)
    .gt('last_sent_at', new Date(Date.now() - 60_000).toISOString())
    .limit(1)
    .maybeSingle();

  if (recentCode) {
    return { ok: true }; // Silently ignore within cooldown
  }

  const code = generateCode();
  const codeHash = await hashCode(code, normalizedEmail);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  // Invalidate previous
  await admin.from('password_reset_codes').delete().eq('user_id', userId).is('consumed_at', null);

  const { error: insertErr } = await admin.from('password_reset_codes').insert({
    user_id: userId,
    email_normalized: normalizedEmail,
    code_hash: codeHash,
    expires_at: expiresAt,
    last_sent_at: new Date().toISOString(),
  });

  if (insertErr) throw new Error("Database insert failed");

  await sendRecoveryEmail(normalizedEmail, code);

  return { ok: true };
}

export async function verifyPasswordReset(email: string, code: string) {
  const admin = getAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: row, error } = await admin
    .from("password_reset_codes")
    .select("*")
    .eq("email_normalized", normalizedEmail)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) throw new Error("code is invalid");
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
  const claimTime = new Date().toISOString();

  // Atomic Claim via conditional update
  const { data: claimedRows, error: claimErr } = await admin
    .from("password_reset_codes")
    .update({ consumed_at: claimTime })
    .match({ 
      email_normalized: normalizedEmail,
      verification_token_hash: tokenHash
    })
    .is("consumed_at", null)
    .not("verified_at", "is", null)
    .gt("verification_expires_at", new Date().toISOString())
    .select("id, user_id");

  if (claimErr || !claimedRows || claimedRows.length !== 1) {
    throw new Error("token invalid or expired");
  }

  const claimed = claimedRows[0];

  try {
    const { error: authErr } = await admin.auth.admin.updateUserById(claimed.user_id, {
      password: newPassword,
    });

    if (authErr) throw authErr;

    return { ok: true };
  } catch (err) {
    // Rollback claim ONLY for this execution
    await admin.from("password_reset_codes")
      .update({ consumed_at: null })
      .match({ id: claimed.id, consumed_at: claimTime });
    
    throw err;
  }
}
