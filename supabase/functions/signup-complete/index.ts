import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sendWelcomeEmail } from "../_shared/signup-email.ts";

async function findAuthUserByEmail(supabaseUrl: string, serviceKey: string, email: string) {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=20&filter=${encodeURIComponent(email)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) {
    console.error("admin user lookup failed", res.status, await res.text());
    throw new Error("lookup_failed");
  }
  const body = await res.json();
  const users: Array<{ id: string; email?: string }> = body?.users ?? [];
  return users.find((u) => (u.email ?? "").trim().toLowerCase() === email) ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let createdUserId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const verificationToken = String(body?.verificationToken || "").trim();
    const password = String(body?.password || "");
    const displayName = String(body?.displayName || "").trim();

    if (!email || !verificationToken) return json({ error: "Sessão inválida", code: "session_invalid" }, 400);
    if (password.length < 6) return json({ error: "A senha deve ter pelo menos 6 caracteres" }, 400);
    if (displayName.length < 2) return json({ error: "Informe seu nome" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Serviço de cadastro temporariamente indisponível." }, 503);
    }
    admin = createClient(supabaseUrl, serviceKey);

    // Best-effort cleanup of expired codes.
    await admin.rpc("cleanup_expired_signup_otps");

    // --- Server-side completeness gate: never touch an already complete account.
    const existing = await findAuthUserByEmail(supabaseUrl, serviceKey, email);
    if (existing) {
      const { data: state, error: stateErr } = await admin.rpc("signup_account_state", {
        p_user_id: existing.id,
      });
      if (stateErr) {
        console.error("signup_account_state error", stateErr);
        return json({ error: "Não foi possível validar a conta." }, 500);
      }
      if (state === "complete") {
        // Complete accounts are never modified (no password change, no data overwrite).
        return json({ ok: false, code: "already_registered" });
      }
    }

    // --- Atomic, single-use consumption of the verification token.
    const { data: consumed, error: consumeErr } = await admin.rpc("consume_signup_verification", {
      p_email: email,
      p_token: verificationToken,
    });
    if (consumeErr) {
      console.error("consume_signup_verification error", consumeErr);
      return json({ error: "Falha ao validar sessão" }, 500);
    }
    const status = Array.isArray(consumed) ? consumed[0]?.status : (consumed as any)?.status ?? consumed;
    if (status === "expired") {
      return json({ error: "Sessão expirada. Solicite um novo código.", code: "session_expired" }, 400);
    }
    if (status !== "ok") {
      return json({ error: "Sessão inválida ou já utilizada.", code: "session_invalid" }, 400);
    }

    // --- Partially provisioned account: finish provisioning, never change the password.
    if (existing) {
      const { error: provErr } = await admin.rpc("provision_signup_account", {
        p_user_id: existing.id,
        p_display_name: displayName,
      });
      if (provErr) {
        console.error("provision (recovery) error", provErr);
        return json({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 500);
      }
      return json({
        ok: false,
        code: "account_recovered_login_required",
        error:
          "Sua conta já existia e foi restaurada. Entre com sua senha ou use “Esqueci minha senha” para redefini-la.",
      });
    }

    // --- New account.
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

    createdUserId = created.user?.id ?? null;
    if (!createdUserId) return json({ error: "Não foi possível criar a conta" }, 500);

    // Transactional profile + workspace provisioning.
    const { data: finalState, error: provErr } = await admin.rpc("provision_signup_account", {
      p_user_id: createdUserId,
      p_display_name: displayName,
    });
    if (provErr || finalState !== "complete") {
      console.error("provision_signup_account failed", provErr, finalState);
      // Rollback: only delete the auth user we created in THIS request.
      const { error: delErr } = await admin.auth.admin.deleteUser(createdUserId);
      if (delErr) console.error("rollback deleteUser failed", delErr);
      return json({ error: "Não foi possível preparar sua conta. Solicite um novo código." }, 500);
    }

    await sendWelcomeEmail(email);
    return json({ ok: true });
  } catch (e) {
    console.error("signup-complete error", e);
    if (createdUserId && admin) {
      const { error: delErr } = await admin.auth.admin.deleteUser(createdUserId);
      if (delErr) console.error("rollback deleteUser failed", delErr);
    }
    return json({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 500);
  }
});
