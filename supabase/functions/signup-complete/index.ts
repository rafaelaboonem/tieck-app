import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sendWelcomeEmail } from "../_shared/signup-email.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const verificationToken = String(body?.verificationToken || "");
    const password = String(body?.password || "");
    const displayName = String(body?.displayName || "").trim();

    if (!email || !verificationToken) return json({ error: "Sessão inválida" }, 400);
    if (password.length < 6) return json({ error: "A senha deve ter pelo menos 6 caracteres" }, 400);
    if (displayName.length < 2) return json({ error: "Informe seu nome" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: rows, error } = await admin
      .from("signup_otp_codes")
      .select("*")
      .eq("email", email)
      .eq("verification_token", verificationToken)
      .eq("verified", true)
      .limit(1);
    if (error) {
      console.error("session select error", error);
      return json({ error: "Falha ao validar sessão" }, 500);
    }
    const row = rows?.[0];
    if (!row) return json({ error: "Sessão inválida ou expirada" }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: "Sessão expirada. Reinicie o cadastro." }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createErr) {
      console.error("create user error", createErr);
      if ((createErr.message || "").toLowerCase().includes("already")) {
        return json({ ok: false, code: "already_registered" });
      }
      return json({ error: "Não foi possível criar a conta" }, 500);
    }

    const userId = created.user?.id;
    if (!userId) return json({ error: "Conta criada, mas não foi possível iniciar o perfil." }, 500);

    const { error: profileErr } = await admin.from("profiles").upsert({
      id: userId,
      display_name: displayName,
    });
    if (profileErr) {
      console.error("profile upsert error", profileErr);
      return json({ error: "Conta criada, mas não foi possível preparar seu perfil." }, 500);
    }

    // Modelo owner-only: o acesso ao workspace é validado por workspaces.owner_id.
    const { error: workspaceErr } = await admin
      .from("workspaces")
      .insert({ owner_id: userId, name: "Meu Workspace", icon: "📁" });
    if (workspaceErr) {
      console.error("workspace create error", workspaceErr);
    }


    await admin.from("signup_otp_codes").delete().eq("id", row.id);
    await sendWelcomeEmail(email);
    return json({ ok: true });
  } catch (e) {
    console.error("signup-complete error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});