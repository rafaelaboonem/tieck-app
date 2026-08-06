// Camera AI V3 — análise pública vinculada ao padrão visual do bloco.
//
// Regras:
//   * uma ÚNICA chamada multimodal por tentativa (referência + candidata);
//   * provedor primário Gemini; Cloudflare permanece apenas como rollback e
//     nunca é chamado em paralelo;
//   * decisão calculada no servidor pelo gate conservador;
//   * nunca aprova por ausência de evidência;
//   * nunca expõe prompt, resposta bruta, chave ou detalhe técnico.

// deno-lint-ignore-file no-explicit-any
import { buildInstruction, callGemini, GeminiError } from "./providers/gemini.ts";
import { decideGemini, validateGeminiPayload } from "./gemini-gate.ts";

export type PublicDecision = "approved" | "retake" | "not_observable";

export type StandardRecord = {
  id: string;
  question: string;
  internal_profile: any;
  version: number | null;
  confidence_threshold: number | null;

  status: string | null;
  unverifiable_conditions: any;
  references?: { storage_path: string }[];
};

export type StandardVerdict = {
  decision: PublicDecision;
  publicMessage: string;
  confidence: number;
  reasonCode: string;
  model: string;
  inferenceMs: number;
  conditionStatus: string | null;
};

function strList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, max);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Busca o padrão visual ativo vinculado ao `cameraBlockId` do snapshot
 * publicado. Sem vínculo válido, devolve null e o chamador cai no fluxo legado.
 */
export async function loadStandardForBlock(
  db: any,
  checklistId: string,
  cameraBlockId: string | null,
): Promise<StandardRecord | null> {
  if (!cameraBlockId) return null;
  const { data } = await db
    .from("visual_standards")
    .select(
      "id, question, internal_profile, confidence_threshold, status, unverifiable_conditions, references:visual_standard_references(storage_path)",
    )
    .eq("checklist_id", checklistId)
    .eq("camera_block_id", cameraBlockId)
    .is("archived_at", null)
    .maybeSingle();
  return (data as StandardRecord | null) ?? null;
}

/** Uma única chamada multimodal e decisão conservadora do servidor. */
export async function analyzeWithStandard(args: {
  db: any;
  standard: StandardRecord;
  question: string;
  candidate: Uint8Array;
  candidateMime: string;
}): Promise<StandardVerdict> {
  const profile = args.standard.internal_profile ?? {};
  const conditions = [
    ...strList(profile?.conditions, 6),
    ...strList(args.standard.unverifiable_conditions, 4),
  ];

  const references: { mime: string; base64: string }[] = [];
  const refPaths = (args.standard.references || []).map(r => r.storage_path);
  
  for (const path of refPaths) {
    const { data: file } = await args.db.storage
      .from("visual-standards")
      .download(path);
    if (file) {
      const buf = new Uint8Array(await file.arrayBuffer());
      references.push({ mime: file.type || "image/jpeg", base64: bytesToBase64(buf) });
    }
  }

  const instruction = buildInstruction({
    question: args.standard.question || args.question,
    profile,
    conditions,
    referenceCount: references.length,
  });

  let call;
  try {
    call = await callGemini({
      instruction,
      references,
      candidate: { mime: args.candidateMime, base64: bytesToBase64(args.candidate) },
      timeoutMs: 45_000,
    });
  } catch (e) {
    // Falha técnica real — jamais vira aprovação nem reprovação da foto.
    throw new Error(e instanceof GeminiError ? e.message : "gemini_request_failed");
  }

  const payload = validateGeminiPayload(call.raw);
  if (!payload) throw new Error("gemini_contract_violation");

  const threshold = Number(args.standard.confidence_threshold);
  const verdict = decideGemini(payload, {
    referenceCount: references.length,
    threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : undefined,
    standardVersion: String((args.standard as any).version || "0"),
    snapshotVersion: String((args as any).snapshotVersion || "0"),
  });


  const decision: PublicDecision = verdict.decision === "approved"
    ? "approved"
    : verdict.decision === "retake"
      ? "retake"
      : "not_observable";

  return {
    decision,
    publicMessage: verdict.public_message,
    confidence: Number(verdict.confidence ?? 0),
    reasonCode: verdict.reason_code ?? "unspecified",
    model: call.model,
    inferenceMs: call.inferenceMs,
    conditionStatus: verdict.condition_status,
  };
}
