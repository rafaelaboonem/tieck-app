import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  hashCode,
  generateCode,
  sendCodeEmail,
  CODE_TTL_MINUTES,
} from "../_shared/signup-email.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email: rawEmail } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "E-mail inválido" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: existing, error: lookupErr } = await admin.rpc("get_user_id_by_email", {
      email_to_find: email,
    });
    if (lookupErr) {
      console.error("lookup error", lookupErr);
      return json({ error: "Não foi possível verificar o e-mail. Tente novamente." }, 500);
    }
    if (existing && existing.length > 0) {
      return json({ ok: false, code: "already_registered" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
    const codeHash = await hashCode(code, email);

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
      await sendCodeEmail(email, code);
    } catch (e) {
      await admin.from("signup_otp_codes").delete().eq("email", email);
      throw e;
    }

    return json({ ok: true });
  } catch (e) {
    console.error("signup-request-otp error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});