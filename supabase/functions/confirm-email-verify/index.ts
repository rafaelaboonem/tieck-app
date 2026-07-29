import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, hashCode } from "../_shared/signup-email.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Não autenticado" }, 401);

    const body = await req.json();
    const code = String(body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) return json({ error: "Código inválido" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user?.email) return json({ error: "Sessão inválida" }, 401);
    if (user.email_confirmed_at) return json({ ok: true, alreadyConfirmed: true });

    const email = user.email.toLowerCase();

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

    const { error: confirmErr } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (confirmErr) {
      console.error("confirm error", confirmErr);
      return json({ error: "Não foi possível confirmar o e-mail." }, 500);
    }

    await admin.from("signup_otp_codes").delete().eq("id", row.id);
    return json({ ok: true });
  } catch (e) {
    console.error("confirm-email-verify error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
