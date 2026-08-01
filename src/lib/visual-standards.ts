import { supabase } from "@/integrations/supabase/client";

export const STANDARDS_BUCKET = "visual-standards";

export type StandardStatus = "draft" | "testing" | "validated" | "needs_improvement";

export const STATUS_LABEL: Record<StandardStatus, string> = {
  draft: "Rascunho",
  testing: "Em teste",
  validated: "Validado",
  needs_improvement: "Precisa melhorar",
};

export const STATUS_TONE: Record<StandardStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  testing: "bg-amber-500/15 text-amber-700",
  validated: "bg-emerald-500/15 text-emerald-700",
  needs_improvement: "bg-rose-500/15 text-rose-700",
};

export interface VisualStandard {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  question: string;
  internal_notes: string | null;
  reference_path: string | null;
  status: StandardStatus;
  test_count: number;
  accuracy: number | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Arquitetura futura do bloco /Camera (Fase 2). Declarado aqui apenas como
 * contrato de tipos — nenhum seletor é exposto na Camera pública nesta fase.
 */
export interface CameraBlockStandardBinding {
  question: string;
  /** "auto" = decisão semântica sem padrão salvo. */
  standard: "auto" | { standardId: string };
  required: boolean;
}

export async function listStandards(workspaceId: string): Promise<VisualStandard[]> {
  const { data, error } = await supabase
    .from("visual_standards")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VisualStandard[];
}

export async function createStandard(input: {
  workspaceId: string;
  name: string;
  question: string;
  internalNotes?: string;
  referenceFile?: File | null;
}): Promise<VisualStandard> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");

  let referencePath: string | null = null;
  if (input.referenceFile) {
    const ext = input.referenceFile.type.includes("png") ? "png"
      : input.referenceFile.type.includes("webp") ? "webp" : "jpg";
    referencePath = `${input.workspaceId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(STANDARDS_BUCKET)
      .upload(referencePath, input.referenceFile, { contentType: input.referenceFile.type, upsert: false });
    if (upErr) throw upErr;
  }

  const { data, error } = await supabase
    .from("visual_standards")
    .insert({
      workspace_id: input.workspaceId,
      created_by: userId,
      name: input.name.trim(),
      question: input.question.trim(),
      internal_notes: input.internalNotes?.trim() || null,
      reference_path: referencePath,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as VisualStandard;
}

/** Signed URL curta (bucket privado, nunca URL pública permanente). */
export async function referenceSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(STANDARDS_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function referenceBase64(path: string): Promise<string | null> {
  const url = await referenceSignedUrl(path);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return blobToBase64(await res.blob());
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

// ---------------- laboratório ----------------

export type LabDecision = "approved" | "retake" | "uncertain" | "technical_failure";
export type ExpectedResult = "approved" | "retake";

export interface LabResponse {
  observer: {
    observation: string;
    targetVisible: boolean;
    blurry: boolean;
    dark: boolean;
    latencyMs: number;
  } | null;
  judge: {
    decision: string;
    targetVisible: boolean | null;
    conditionMet: boolean | null;
    qualitySufficient: boolean | null;
    reasonCode: string | null;
    observations: string[];
    confidence: number | null;
    latencyMs: number;
  } | null;
  combined: { decision: LabDecision; reason_code: string; public_message: string };
  referenceMode: "none" | "multi_image" | "derived";
  totalLatencyMs: number;
}

export interface LabRun extends LabResponse {
  id: string;
  at: string;
  question: string;
  expected: ExpectedResult;
  correct: boolean | null;
}

export async function runBenchmark(input: {
  workspaceId: string;
  question: string;
  imageBase64: string;
  referenceBase64?: string | null;
}): Promise<LabResponse> {
  const { data, error } = await supabase.functions.invoke("vision-benchmark", {
    body: {
      action: "benchmark-evaluate",
      workspaceId: input.workspaceId,
      question: input.question,
      imageBase64: input.imageBase64,
      referenceBase64: input.referenceBase64 ?? undefined,
    },
  });
  if (error) throw error;
  return data as LabResponse;
}

export function isCorrect(run: Pick<LabRun, "combined" | "expected">): boolean | null {
  const d = run.combined.decision;
  if (d === "uncertain" || d === "technical_failure") return null;
  return d === run.expected;
}

// ---------------- métricas da sessão ----------------

export const MIN_LABELED_SAMPLE = 10;

export interface SessionMetrics {
  total: number;
  hits: number;
  falseApprovals: number;
  falseRejections: number;
  uncertain: number;
  technicalFailures: number;
  agreement: number | null;
  avgLatencyMs: number | null;
  withReference: number;
  withoutReference: number;
  accuracy: number | null;
  enoughSample: boolean;
}

export function computeMetrics(runs: LabRun[]): SessionMetrics {
  const total = runs.length;
  let hits = 0, falseApprovals = 0, falseRejections = 0, uncertain = 0, failures = 0;
  let agreeCount = 0, comparable = 0, latencySum = 0, withRef = 0;

  for (const r of runs) {
    const d = r.combined.decision;
    if (d === "technical_failure") failures++;
    else if (d === "uncertain") uncertain++;
    else if (d === r.expected) hits++;
    else if (d === "approved") falseApprovals++;
    else falseRejections++;

    if (r.judge && r.observer) {
      comparable++;
      const observerNegative = r.observer.blurry || r.observer.dark || !r.observer.targetVisible;
      const judgeNegative = r.judge.decision !== "approved";
      if (observerNegative === judgeNegative) agreeCount++;
    }
    latencySum += r.totalLatencyMs;
    if (r.referenceMode !== "none") withRef++;
  }

  const labeled = hits + falseApprovals + falseRejections;
  return {
    total,
    hits,
    falseApprovals,
    falseRejections,
    uncertain,
    technicalFailures: failures,
    agreement: comparable ? agreeCount / comparable : null,
    avgLatencyMs: total ? Math.round(latencySum / total) : null,
    withReference: withRef,
    withoutReference: total - withRef,
    accuracy: labeled ? hits / labeled : null,
    enoughSample: labeled >= MIN_LABELED_SAMPLE,
  };
}

/** Exportação sem imagens, base64, URLs, tokens ou resposta bruta. */
export function exportRows(runs: LabRun[]) {
  return runs.map((r) => ({
    at: r.at,
    question: r.question,
    expected: r.expected,
    combined_decision: r.combined.decision,
    reason_code: r.combined.reason_code,
    judge_decision: r.judge?.decision ?? null,
    observer_target_visible: r.observer?.targetVisible ?? null,
    observer_blurry: r.observer?.blurry ?? null,
    observer_dark: r.observer?.dark ?? null,
    reference_mode: r.referenceMode,
    correct: r.correct,
    observer_latency_ms: r.observer?.latencyMs ?? null,
    judge_latency_ms: r.judge?.latencyMs ?? null,
    total_latency_ms: r.totalLatencyMs,
  }));
}

export function toCsv(runs: LabRun[]): string {
  const rows = exportRows(runs);
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","))].join("\n");
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
