// Public edge function: receives an anonymous file upload for a public
// checklist response and stores it in the PRIVATE checklist-evidences
// bucket using the service role. The caller must present a valid
// (response_id, upload_token) pair issued by public.submit_public_response.
//
// The bucket path is generated server-side — arbitrary client-supplied
// paths are never accepted. anon has no direct storage.objects INSERT.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME = new Set([
  "image/jpeg","image/jpg","image/png","image/webp","image/heic","image/heif",
]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return encodeHex(new Uint8Array(digest));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected_multipart" }, 400);
  }

  const responseId  = String(form.get("response_id") ?? "").trim();
  const token       = String(form.get("token") ?? "").trim();
  const blockId     = String(form.get("block_id") ?? "").trim();
  const file        = form.get("file");

  if (!responseId || !token || !blockId) return json({ error: "missing_fields" }, 400);
  if (!(file instanceof File))            return json({ error: "missing_file" }, 400);
  if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: "file_too_large" }, 413);
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime))            return json({ error: "unsupported_type" }, 415);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Validate the token issued by submit_public_response and confirm the
  // response is still tied to a published checklist.
  const tokenHash = await sha256Hex(token);
  const { data: rows, error: qErr } = await admin
    .from("checklist_responses")
    .select("id, checklist_id, upload_token_hash, upload_token_expires_at")
    .eq("id", responseId)
    .limit(1);
  if (qErr) return json({ error: "lookup_failed" }, 500);
  const row = rows?.[0];
  if (!row)                                     return json({ error: "response_not_found" }, 404);
  if (row.upload_token_hash !== tokenHash)      return json({ error: "invalid_token" }, 401);
  if (!row.upload_token_expires_at || new Date(row.upload_token_expires_at) < new Date()) {
    return json({ error: "token_expired" }, 401);
  }

  const { data: cl, error: cErr } = await admin
    .from("checklists")
    .select("id, is_published")
    .eq("id", row.checklist_id)
    .maybeSingle();
  if (cErr || !cl || !cl.is_published) return json({ error: "checklist_unavailable" }, 403);

  // Server-generated storage path (client cannot influence it).
  const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const objectName = crypto.randomUUID();
  const path = `${cl.id}/${responseId}/${blockId}/${objectName}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("checklist-evidences")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) return json({ error: "upload_failed", detail: upErr.message }, 500);

  const { error: iErr } = await admin
    .from("checklist_evidences")
    .insert({
      checklist_id: cl.id,
      response_id: responseId,
      block_id: blockId,
      storage_path: path,
      mime_type: mime,
      size_bytes: file.size,
      uploaded: true,
      source: "public_share_link",
      origin_bucket: "checklist-evidences",
    });
  if (iErr) return json({ error: "registration_failed", detail: iErr.message }, 500);

  return json({ ok: true, storage_path: path });
});
