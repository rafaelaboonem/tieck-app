import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  hashCode,
  generateToken,
  VERIFY_TOKEN_TTL_MINUTES,
} from "../_shared/signup-email.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "").trim();
    if (!email || !/^\d{6}$/.test(code)) {
      return json({ error: "Código inválido" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: rows, error } = await admin
      .from("signup_otp_codes")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("select error", error);
      return json({ error: "Falha ao verificar código" }, 500);
    }
    const row = rows?.[0];
    if (!row) return json({ error: "Solicite um novo código" }, 400);
    if (row.verified) return json({ error: "Este código já foi utilizado" }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: "Código expirado. Solicite um novo." }, 400);
    }
    if (row.attempts >= 5) {
      return json({ error: "Muitas tentativas. Solicite um novo código." }, 400);
    }

    const expected = await hashCode(code, email);
    if (row.code_hash !== expected) {
      await admin.from("signup_otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "Código inválido" }, 400);
    }

    const token = generateToken();
    const { error: updateErr } = await admin
      .from("signup_otp_codes")
      .update({
        verified: true,
        verification_token: token,
        expires_at: new Date(Date.now() + VERIFY_TOKEN_TTL_MINUTES * 60_000).toISOString(),
      })
      .eq("id", row.id);
    if (updateErr) {
      console.error("update error", updateErr);
      return json({ error: "Falha ao confirmar código" }, 500);
    }

    return json({ ok: true, verificationToken: token });
  } catch (e) {
    console.error("signup-verify-otp error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});