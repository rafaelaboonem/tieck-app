import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  hashCode,
  generateCode,
  sendConfirmationCodeEmail,
  CODE_TTL_MINUTES,
} from "../_shared/signup-email.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user?.email) return json({ error: "Sessão inválida" }, 401);

    if (user.email_confirmed_at) {
      return json({ ok: true, alreadyConfirmed: true });
    }

    const email = user.email.toLowerCase();
    const code = generateCode();
    const codeHash = await hashCode(code, email);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    await admin.from("signup_otp_codes").delete().eq("email", email);
    const { error: insertErr } = await admin.from("signup_otp_codes").insert({
      email,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insertErr) {
      console.error("insert error", insertErr);
      return json({ error: "Não foi possível gerar o código." }, 500);
    }

    try {
      await sendConfirmationCodeEmail(email, code);
    } catch (e) {
      await admin.from("signup_otp_codes").delete().eq("email", email);
      throw e;
    }

    return json({ ok: true, email });
  } catch (e) {
    console.error("confirm-email-request error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
