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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const { email: rawEmail } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "E-mail inválido" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      console.error("signup-request-otp missing backend configuration");
      return json({ error: "Serviço de cadastro temporariamente indisponível." }, 503);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verifica se o e-mail já existe via Admin API (não depende de acesso ao schema auth).
    const lookupRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    );
    if (!lookupRes.ok) {
      console.error("lookup error", lookupRes.status, await lookupRes.text());
      return json({ error: "Não foi possível verificar o e-mail. Tente novamente." }, 500);
    }
    const lookupBody = await lookupRes.json();
    const users: Array<{ email?: string }> = lookupBody?.users ?? [];
    if (users.some((u) => (u.email ?? "").toLowerCase() === email)) {
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