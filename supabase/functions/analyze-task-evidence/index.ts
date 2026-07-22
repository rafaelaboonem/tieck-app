// Edge Function: analyze-task-evidence
// Executes AI-based analysis of a submitted task evidence photo.
// Called by the authenticated client immediately after upload.
//
// Input:  { evidenceId: string }
// The function never trusts additional IDs — everything else is read from DB.

/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import type {
  VisionProvider,
  VisionFallbackMode,
} from "./providers/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT_VERSION = "v1.0.0";
const AI_MODEL = "google/gemini-2.5-flash";

type VisualCriterion = {
  id: string;
  title: string;
  description: string;
  required: boolean;
  severity: "low" | "medium" | "high" | "critical";
};

type CriterionResult = {
  criterionId: string;
  passed: boolean | null;
  confidence: number;
  observation: string;
};

type AIAnalysis = {
  decision: "approved" | "rejected" | "manual_review";
  confidence: number;
  summary: string;
  imageQuality: { acceptable: boolean; issues: string[] };
  criteria: CriterionResult[];
  detectedProblems: string[];
  resubmitInstructions: string | null;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function toDataUrl(
  supabase: any,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`storage_download_failed:${path}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  // base64 encode
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  const mime = (data as Blob).type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

function buildSystemPrompt(): string {
  return [
    "Você é um auditor visual de operações em restaurantes/franquias.",
    "Analise APENAS o que a imagem enviada permite comprovar visualmente.",
    "NUNCA afirme que verificou temperatura interna, validade não legível, odor,",
    "funcionamento interno de equipamento, concentração química ou tempo exato.",
    "Para itens não observáveis na foto, marque o critério como passed=null.",
    "Compare a foto enviada com a foto de referência do padrão da tarefa quando disponível.",
    "Responda APENAS com JSON válido no schema fornecido, sem texto adicional.",
  ].join(" ");
}

function buildUserPrompt(
  taskTitle: string,
  taskDescription: string | null,
  criticality: string,
  criteria: VisualCriterion[],
): string {
  return JSON.stringify({
    instruction:
      "Avalie a foto enviada contra os critérios objetivos abaixo. Retorne o JSON no schema exigido.",
    task: { title: taskTitle, description: taskDescription, criticality },
    criteria,
    rules: {
      onlyVisualEvidence: true,
      unobservableCriteriaShouldBeNull: true,
      confidenceRange: [0, 1],
      decisionRules: {
        approved: "confidence>=0.9 e todos os required passaram",
        rejected: "confidence>=0.9 e algum required falhou claramente",
        manual_review: "baixa confiança, imagem ruim ou dúvida",
      },
    },
  });
}

function validateAnalysis(
  parsed: any,
  criteria: VisualCriterion[],
): AIAnalysis | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (!["approved", "rejected", "manual_review"].includes(parsed.decision)) {
    return null;
  }
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    return null;
  }
  if (typeof parsed.summary !== "string") return null;
  if (!parsed.imageQuality || typeof parsed.imageQuality.acceptable !== "boolean") {
    return null;
  }
  if (!Array.isArray(parsed.criteria)) return null;
  // Every declared criterion must appear
  const seen = new Set<string>();
  for (const c of parsed.criteria) {
    if (!c || typeof c.criterionId !== "string") return null;
    if (!(c.passed === true || c.passed === false || c.passed === null)) return null;
    if (typeof c.confidence !== "number") return null;
    seen.add(c.criterionId);
  }
  for (const decl of criteria) {
    if (!seen.has(decl.id)) return null;
  }
  if (!Array.isArray(parsed.detectedProblems)) return null;
  if (
    parsed.resubmitInstructions !== null &&
    typeof parsed.resubmitInstructions !== "string"
  ) return null;
  return parsed as AIAnalysis;
}

// ---------------------------------------------------------------------------
// Helpers de persistência multi-provedor
// ---------------------------------------------------------------------------

async function persistManualReview(
  admin: any,
  ev: any,
  provider: VisionProvider,
  summary: string,
  processingStartedAt: string,
) {
  await admin.from("evidence_ai_analyses").insert({
    organization_id: ev.organization_id,
    unit_id: ev.unit_id,
    evidence_id: ev.id,
    task_execution_id: ev.task_execution_id,
    provider,
    decision: "manual_review",
    confidence: null,
    summary,
    criteria_results: [],
    detected_problems: [],
    processing_started_at: processingStartedAt,
    processing_finished_at: new Date().toISOString(),
  });
  await admin.from("evidences").update({ status: "manual_review" }).eq("id", ev.id);
}

async function persistFailure(
  admin: any,
  ev: any,
  provider: VisionProvider,
  errorCode: string,
  errorMessage: string | null,
  processingStartedAt: string,
) {
  await admin.from("evidence_ai_analyses").insert({
    organization_id: ev.organization_id,
    unit_id: ev.unit_id,
    evidence_id: ev.id,
    task_execution_id: ev.task_execution_id,
    provider,
    decision: "analysis_failed",
    error_code: errorCode,
    error_message: errorMessage,
    processing_started_at: processingStartedAt,
    processing_finished_at: new Date().toISOString(),
  });
  await admin.from("evidences").update({ status: "analysis_failed" }).eq("id", ev.id);
}

// Fluxo antigo de visão externa foi removido. A rota de análise agora
// só considera "openai" (Lovable AI Gateway) ou "manual".

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json(500, { error: "missing_ai_key" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userJwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!userJwt) return json(401, { error: "unauthorized" });

  // Client scoped to the caller — enforces RLS/access on the initial read.
  const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Service client — only used for atomic status transitions and insert.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let evidenceId: string;
  try {
    const body = await req.json();
    if (!body || typeof body.evidenceId !== "string") throw new Error();
    evidenceId = body.evidenceId;
  } catch {
    return json(400, { error: "invalid_body" });
  }

  // 1) Confirm the caller can read the evidence (RLS gate).
  const { data: evVisible, error: evErr } = await asUser
    .from("evidences")
    .select("id")
    .eq("id", evidenceId)
    .maybeSingle();
  if (evErr || !evVisible) return json(403, { error: "forbidden" });

  // 2) Atomic claim: pending/analysis_failed -> processing.
  const { data: claimRow, error: claimErr } = await admin.rpc(
    "claim_evidence_for_analysis",
    { p_evidence_id: evidenceId },
  );
  if (claimErr) return json(500, { error: "claim_failed", detail: claimErr.message });
  const claim = Array.isArray(claimRow) ? claimRow[0] : claimRow;
  if (!claim?.claimed) {
    return json(200, {
      status: "already_processed_or_locked",
      current_status: claim?.current_status,
    });
  }

  const processingStartedAt = new Date().toISOString();

  // 3) Load evidence + execution + task with criteria and reference photo.
  const { data: ev, error: loadErr } = await admin
    .from("evidences")
    .select(
      "id, organization_id, unit_id, task_id, task_execution_id, storage_path, submitted_by, task_executions!inner(id, scheduled_at, shift_id, task_id), tasks:task_id(id, title, description, weight, ai_review_mode, visual_criteria, reference_path, vision_provider, vision_analysis_enabled, vision_model_id, vision_fallback_mode)",
    )
    .eq("id", evidenceId)
    .maybeSingle();

  if (loadErr || !ev) {
    await admin.from("evidences").update({ status: "analysis_failed" }).eq("id", evidenceId);
    return json(500, { error: "load_failed" });
  }

  const task = (ev as any).tasks;
  const criteria: VisualCriterion[] = Array.isArray(task?.visual_criteria)
    ? task.visual_criteria
    : [];
  const mode: string = task?.ai_review_mode ?? "automatic_with_human_fallback";
  const criticality = task?.weight ?? "comum";

  // If disabled, immediately mark manual_review and return.
  if (mode === "disabled") {
    await admin.from("evidences").update({ status: "manual_review" }).eq("id", evidenceId);
    await admin.from("evidence_ai_analyses").insert({
      organization_id: ev.organization_id,
      unit_id: ev.unit_id,
      evidence_id: ev.id,
      task_execution_id: ev.task_execution_id,
      provider: "manual" as VisionProvider,
      decision: "manual_review",
      confidence: null,
      summary: "Análise por IA desativada para esta tarefa.",
      criteria_results: [],
      detected_problems: [],
      resubmit_instructions: null,
      model: AI_MODEL,
      prompt_version: PROMPT_VERSION,
      processing_started_at: processingStartedAt,
      processing_finished_at: new Date().toISOString(),
    });
    return json(200, { status: "manual_review" });
  }

  // ---- Roteamento por provedor visual ----
  const rawProvider = String(task?.vision_provider ?? "manual");
  // Provedor externo de visão foi removido — qualquer valor legado cai
  // em revisão manual.
  const visionProvider: VisionProvider =
    rawProvider === "openai" ? "openai" : "manual";
  const visionEnabled: boolean = task?.vision_analysis_enabled === true;
  const fallbackMode: VisionFallbackMode =
    (task?.vision_fallback_mode ?? "manual_review") as VisionFallbackMode;

  // Se a análise visual não está ativa, tratar como fallback direto.
  const effectiveProvider: VisionProvider =
    visionEnabled ? visionProvider : "manual";

  // Nota: apenas "openai" (via Lovable AI Gateway) segue com análise
  // automática. Qualquer outro valor efetivo cai em revisão manual.
  if (effectiveProvider !== "openai") {
    void fallbackMode; // reservado para regras futuras
    await persistManualReview(admin, ev, "manual", "Provedor visual manual — sem análise automática.", processingStartedAt);
    return json(200, { status: "manual_review" });
  }
  // effectiveProvider === "openai" OU fallback openai → executa fluxo abaixo.

  // 4) Download images and inline as data URLs (signed URLs never persisted).
  let submittedUrl: string;
  let referenceUrl: string | null = null;
  try {
    submittedUrl = await toDataUrl(admin, "evidences", ev.storage_path);
    if (task?.reference_path) {
      try {
        referenceUrl = await toDataUrl(admin, "evidences", task.reference_path);
      } catch {
        referenceUrl = null;
      }
    }
  } catch (e) {
    await admin.from("evidences").update({ status: "analysis_failed" }).eq("id", evidenceId);
    await admin.from("evidence_ai_analyses").insert({
      organization_id: ev.organization_id,
      unit_id: ev.unit_id,
      evidence_id: ev.id,
      task_execution_id: ev.task_execution_id,
      decision: "analysis_failed",
      error_code: "storage_download_failed",
      error_message: String((e as Error).message).slice(0, 500),
      model: AI_MODEL,
      prompt_version: PROMPT_VERSION,
      processing_started_at: processingStartedAt,
      processing_finished_at: new Date().toISOString(),
    });
    return json(500, { error: "storage_download_failed" });
  }

  // 5) Call Lovable AI Gateway with structured output.
  const content: any[] = [
    { type: "text", text: buildUserPrompt(task.title, task.description, criticality, criteria) },
    { type: "image_url", image_url: { url: submittedUrl } },
  ];
  if (referenceUrl) {
    content.push({
      type: "text",
      text: "Foto de referência (padrão esperado) a seguir:",
    });
    content.push({ type: "image_url", image_url: { url: referenceUrl } });
  }

  const responseSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "decision", "confidence", "summary", "imageQuality",
      "criteria", "detectedProblems", "resubmitInstructions",
    ],
    properties: {
      decision: { type: "string", enum: ["approved", "rejected", "manual_review"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string" },
      imageQuality: {
        type: "object", additionalProperties: false,
        required: ["acceptable", "issues"],
        properties: {
          acceptable: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
        },
      },
      criteria: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["criterionId", "passed", "confidence", "observation"],
          properties: {
            criterionId: { type: "string" },
            passed: { type: ["boolean", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            observation: { type: "string" },
          },
        },
      },
      detectedProblems: { type: "array", items: { type: "string" } },
      resubmitInstructions: { type: ["string", "null"] },
    },
  };

  let analysis: AIAnalysis | null = null;
  let rawErr: string | null = null;
  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "evidence_analysis",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
    });

    if (!aiResp.ok) {
      rawErr = `ai_http_${aiResp.status}`;
    } else {
      const payload = await aiResp.json();
      const text = payload?.choices?.[0]?.message?.content;
      const parsed = typeof text === "string" ? JSON.parse(text) : text;
      analysis = validateAnalysis(parsed, criteria);
      if (!analysis) rawErr = "schema_validation_failed";
    }
  } catch (e) {
    rawErr = `ai_exception:${String((e as Error).message).slice(0, 200)}`;
  }

  const processingFinishedAt = new Date().toISOString();

  // 6) Persist analysis + resolve status.
  if (!analysis) {
    await admin.from("evidence_ai_analyses").insert({
      organization_id: ev.organization_id,
      unit_id: ev.unit_id,
      evidence_id: ev.id,
      task_execution_id: ev.task_execution_id,
      provider: "openai" as VisionProvider,
      decision: "analysis_failed",
      error_code: "analysis_failed",
      error_message: rawErr,
      model: AI_MODEL,
      prompt_version: PROMPT_VERSION,
      processing_started_at: processingStartedAt,
      processing_finished_at: processingFinishedAt,
    });
    await admin.from("evidences").update({ status: "analysis_failed" }).eq("id", evidenceId);
    return json(200, { status: "analysis_failed", error: rawErr });
  }

  // Apply mode-based overrides.
  let finalDecision: string = analysis.decision;
  if (mode === "human_required") {
    finalDecision = "manual_review";
  } else if (mode === "automatic_with_human_fallback" && analysis.decision === "approved") {
    if (analysis.confidence < 0.9 || !analysis.imageQuality.acceptable) {
      finalDecision = "manual_review";
    }
  } else if (mode === "automatic" && analysis.confidence < 0.9) {
    finalDecision = "manual_review";
  }

  await admin.from("evidence_ai_analyses").insert({
    organization_id: ev.organization_id,
    unit_id: ev.unit_id,
    evidence_id: ev.id,
    task_execution_id: ev.task_execution_id,
    provider: "openai" as VisionProvider,
    decision: finalDecision as any,
    confidence: analysis.confidence,
    summary: analysis.summary,
    image_quality: analysis.imageQuality,
    criteria_results: analysis.criteria,
    detected_problems: analysis.detectedProblems,
    resubmit_instructions: analysis.resubmitInstructions,
    model: AI_MODEL,
    prompt_version: PROMPT_VERSION,
    processing_started_at: processingStartedAt,
    processing_finished_at: processingFinishedAt,
  });

  await admin.from("evidences").update({ status: finalDecision }).eq("id", evidenceId);

  return json(200, { status: finalDecision, confidence: analysis.confidence });
});