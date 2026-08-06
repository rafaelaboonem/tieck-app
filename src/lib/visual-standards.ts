import { supabase } from "@/integrations/supabase/client";

export const STANDARDS_BUCKET = "visual-standards";

export type StandardStatus = "draft" | "preparing" | "ready" | "validated" | "archived";

export const STATUS_LABEL: Record<StandardStatus, string> = {
  draft: "Rascunho",
  preparing: "Preparando",
  ready: "Pronto para ativar",
  validated: "Ativo",
  archived: "Arquivado",
};

export const STATUS_TONE: Record<StandardStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  preparing: "bg-blue-500/15 text-blue-700",
  ready: "bg-amber-500/15 text-amber-700",
  validated: "bg-emerald-500/15 text-emerald-700",
  archived: "bg-neutral-500/15 text-neutral-700",
};

export interface VisualStandardReference {
  id: string;
  visual_standard_id: string;
  workspace_id: string;
  storage_path: string;
  position: 1 | 2;
  created_at: string;
}

export interface VisualStandard {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  question: string;
  internal_notes: string | null;
  /** @deprecated Use references instead */
  reference_path: string | null;
  references?: VisualStandardReference[];
  status: StandardStatus;
  test_count: number;
  accuracy: number | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  /** Vínculo com a pergunta /Camera do checklist (fonte oficial do texto). */
  checklist_id?: string | null;
  camera_block_id?: string | null;
  archived_at?: string | null;
  /** Texto da pergunta na última validação — usado para detectar edições. */
  validated_question?: string | null;
  /** Perfil interno gerado no servidor — nunca exibido ao usuário final. */
  internal_profile?: StandardProfile | Record<string, never> | null;
  profile_version?: number;
  needs_validation?: boolean;
  /** Verificabilidade avaliada no servidor. */
  visual_verifiability?: string | null;
  unverifiable_conditions?: unknown[] | null;
  required_evidence_count?: number | null;
  confidence_threshold?: number | null;
}

export interface StandardProfile {
  target_phrase: string;
  target_phrase_en: string;
  requested_condition: string;
  observable_signals: string[];
  contrary_signals: string[];
  insufficient_view_signals: string[];
  reference_summary: string | null;
  version: number;
  generated_at: string;
}

export function profileOf(standard: VisualStandard | null): StandardProfile | null {
  const p = standard?.internal_profile as StandardProfile | undefined;
  return p && typeof p === "object" && p.target_phrase ? p : null;
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
    .select("*, references:visual_standard_references(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VisualStandard[];
}

/** Padrão ativo (não arquivado) de uma pergunta /Camera. */
export function standardForBlock(
  standards: VisualStandard[],
  checklistId: string,
  cameraBlockId: string,
): VisualStandard | null {
  return (
    standards.find(
      (s) =>
        !s.archived_at &&
        s.checklist_id === checklistId &&
        s.camera_block_id === cameraBlockId,
    ) ?? null
  );
}

export type BlockStandardStatus = "none" | "validating" | "active";

export function blockStandardStatus(s: VisualStandard | null): BlockStandardStatus {
  if (!s) return "none";
  return s.status === "validated" && !s.needs_validation ? "active" : "validating";
}

export const BLOCK_STATUS_LABEL: Record<BlockStandardStatus, string> = {
  none: "Padrão não configurado",
  validating: "Padrão em validação",
  active: "Padrão ativo",
};

/**
 * Cria o padrão a partir de uma pergunta /Camera existente. O texto da
 * pergunta vem do bloco — nunca é digitado novamente aqui.
 */
export async function createStandard(input: {
  workspaceId: string;
  checklistId: string;
  cameraBlockId: string;
  question: string;
  /** Opcional: preenchido automaticamente a partir da pergunta. */
  name?: string;
  internalNotes?: string;
  referenceFile?: File | null;
}): Promise<VisualStandard> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");
  if (!input.workspaceId) throw new Error("Nenhum workspace válido selecionado.");
  if (!input.checklistId || !input.cameraBlockId) {
    throw new Error("Selecione o projeto e a pergunta de câmera.");
  }

  // Fonte autoritativa: só workspaces visíveis pela sessão (RLS) são aceitos.
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", input.workspaceId)
    .maybeSingle();
  if (wsErr) throw wsErr;
  if (!ws) throw new Error("Você não tem acesso a este workspace.");

  const question = input.question.trim();
  const autoName = (input.name?.trim() || question).slice(0, 120);

  // 1) Cria o registro autorizado primeiro (evita arquivos órfãos).
  const { data, error } = await supabase
    .from("visual_standards")
    .insert({
      workspace_id: input.workspaceId,
      created_by: userId,
      checklist_id: input.checklistId,
      camera_block_id: input.cameraBlockId,
      name: autoName,
      question,
      validated_question: question,
      internal_notes: input.internalNotes?.trim() || null,
      reference_path: null,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Esta pergunta já possui um padrão visual.");
    }
    throw error;
  }
  const standard = data as VisualStandard;

  // 2) Envia a referência e 3) atualiza o registro com o caminho.
  if (input.referenceFile) {
    try {
      await uploadReference(standard, input.referenceFile, 1);
      const { data: updated } = await supabase
        .from("visual_standards")
        .select("*, references:visual_standard_references(*)")
        .eq("id", standard.id)
        .single();
      return updated as VisualStandard;
    } catch (e) {
      throw new Error(
        `Padrão criado, mas a foto de referência não pôde ser enviada: ${(e as Error).message}`,
      );
    }
  }
  return standard;
}

/** Vincula manualmente um padrão antigo a uma pergunta /Camera existente. */
export async function linkStandardToBlock(
  standard: VisualStandard,
  input: { checklistId: string; cameraBlockId: string; question: string },
): Promise<VisualStandard> {
  const question = input.question.trim();
  const { data, error } = await supabase
    .from("visual_standards")
    .update({
      checklist_id: input.checklistId,
      camera_block_id: input.cameraBlockId,
      question,
      archived_at: null,
      needs_validation: question !== (standard.validated_question ?? standard.question),
    })
    .eq("id", standard.id)
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Esta pergunta já possui um padrão visual.");
    }
    throw error;
  }
  return data as VisualStandard;
}

/**
 * Sincroniza os padrões com os blocos /Camera atuais do checklist:
 * pergunta editada → revalidação obrigatória; bloco removido → arquivado.
 * Nada é apagado e nenhuma inferência é executada aqui.
 */
export async function syncStandardsWithBlocks(input: {
  checklistId: string;
  blocks: { cameraBlockId: string; question: string }[];
}): Promise<{ revalidate: number; archived: number; restored: number }> {
  const { data, error } = await supabase
    .from("visual_standards")
    .select("*")
    .eq("checklist_id", input.checklistId);
  if (error || !data) return { revalidate: 0, archived: 0, restored: 0 };

  const byBlock = new Map(input.blocks.map((b) => [b.cameraBlockId, b.question.trim()]));
  let revalidate = 0, archived = 0, restored = 0;

  for (const raw of data as VisualStandard[]) {
    if (!raw.camera_block_id) continue;
    const current = byBlock.get(raw.camera_block_id);

    if (current === undefined) {
      // Bloco removido: arquiva sem apagar referência nem histórico.
      if (!raw.archived_at) {
        await supabase
          .from("visual_standards")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", raw.id);
        archived++;
      }
      continue;
    }

    const patch: {
      archived_at?: string | null;
      question?: string;
      name?: string;
      needs_validation?: boolean;
      status?: StandardStatus;
    } = {};
    if (raw.archived_at) { patch.archived_at = null; restored++; }
    if (current !== raw.question) {
      patch.question = current;
      patch.name = current.slice(0, 120);
      patch.needs_validation = true;
      patch.status = "preparing";
      revalidate++;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("visual_standards").update(patch).eq("id", raw.id);
    }

  }
  return { revalidate, archived, restored };
}

/** Restauração manual de um padrão arquivado (bloco reinserido). */
export async function restoreStandard(standard: VisualStandard): Promise<void> {
  const { error } = await supabase
    .from("visual_standards")
    .update({ archived_at: null })
    .eq("id", standard.id);
  if (error) throw error;
}


function extFor(file: File): string {
  return file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
}

/** Envia/substitui uma referência (posição 1 ou 2) sem deixar arquivo órfão. */
export async function uploadReference(
  standard: VisualStandard,
  file: File,
  position: 1 | 2 = 1
): Promise<VisualStandardReference> {
  const path = `${standard.workspace_id}/${standard.id}/reference-${position}.${extFor(file)}`;
  
  // 1. Upload new file
  const { error: upErr } = await supabase.storage
    .from(STANDARDS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) throw upErr;

  try {
    // 2. Get existing reference at this position to delete later
    const existing = standard.references?.find(r => r.position === position);

    // 3. Update database
    const { data, error } = await supabase
      .from("visual_standard_references")
      .upsert({
        visual_standard_id: standard.id,
        workspace_id: standard.workspace_id,
        storage_path: path,
        position
      }, { onConflict: 'visual_standard_id,position' })
      .select("*")
      .single();

    if (error) throw error;

    // 4. Delete old file if path changed
    if (existing && existing.storage_path !== path) {
      await supabase.storage.from(STANDARDS_BUCKET).remove([existing.storage_path]);
    }

    // 5. If this was position 1, also update legacy reference_path for compatibility
    if (position === 1) {
      await supabase
        .from("visual_standards")
        .update({ reference_path: path })
        .eq("id", standard.id);
    }

    return data as VisualStandardReference;
  } catch (err) {
    // Cleanup: remove the newly uploaded file if DB update failed
    await supabase.storage.from(STANDARDS_BUCKET).remove([path]);
    throw err;
  }
}

export async function deleteReference(
  standard: VisualStandard,
  position: 1 | 2
): Promise<void> {
  const reference = standard.references?.find(r => r.position === position);
  if (!reference) return;

  const { error } = await supabase
    .from("visual_standard_references")
    .delete()
    .eq("id", reference.id);
  if (error) throw error;

  await supabase.storage.from(STANDARDS_BUCKET).remove([reference.storage_path]);

  // Compatibility: clear legacy path if position 1 removed
  if (position === 1) {
    await supabase
      .from("visual_standards")
      .update({ reference_path: null })
      .eq("id", standard.id);
  }
}

export async function deleteStandard(standard: VisualStandard): Promise<void> {
  const { error } = await supabase.from("visual_standards").delete().eq("id", standard.id);
  if (error) throw error;
  if (standard.reference_path) {
    await supabase.storage.from(STANDARDS_BUCKET).remove([standard.reference_path]);
  }
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
export type ConditionStatusOnly = ConditionStatus;
export type ConditionStatus = "verified" | "not_met" | "not_observable";

export const CONDITION_STATUS_LABEL: Record<ConditionStatus, string> = {
  verified: "Verificado pela foto",
  not_met: "Não atendido",
  not_observable: "Não verificável por foto",
};

/** Orçamento de IA por sessão de câmera — decidido e aplicado no servidor. */
export const LIVE_CHECKS_PER_SESSION = 3;
export const FINAL_CHECKS_PER_SESSION = 5;
export const LIVE_MIN_INTERVAL_MS = 5000;

/** Provedor visual usado na avaliação. Seletor interno do laboratório. */
export type LabProvider = "google_gemini" | "cloudflare";
export const DEFAULT_LAB_PROVIDER: LabProvider = "google_gemini";
export const LAB_PROVIDERS: { value: LabProvider; label: string; hint: string }[] = [
  { value: "google_gemini", label: "Gemini 3.6 Flash", hint: "Uma única análise multimodal. Medido em tokens." },
  { value: "cloudflare", label: "Cloudflare (Moondream + Llama)", hint: "Rollback. Medido em neurônios." },
];

export interface UsageStep {
  step: string;
  provider?: LabProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens?: number | null;
  /** Somente Cloudflare. */
  neurons: number | null;
  /** Somente Gemini: custo teórico em USD. */
  costUsd?: number | null;
  inferenceMs: number;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens?: number | null;
  /** Somente Cloudflare. */
  neurons: number | null;
  /** Somente Gemini: custo teórico em USD. */
  costUsd?: number | null;
  /** Valor teórico dos neurônios Cloudflare. */
  estimatedUsd?: number | null;
  theoreticalUsd?: number | null;
  steps: UsageStep[];
}



export interface BudgetInfo {
  spent: boolean;
  used: number;
  remaining: number;
  reason: string;
}

/**
 * Sessão do laboratório: o identificador é emitido pelo servidor e validado
 * a cada chamada. O cliente nunca inventa nem reinicia um orçamento.
 */
export interface LabSession {
  ok: boolean;
  sessionId: string;
  expiresAt: string | null;
  reused: boolean;
  liveUsed: number;
  liveLimit: number;
  attemptsUsed: number;
  attemptsLimit: number;
  reason?: string;
  message?: string;
}

export async function startLabSession(
  workspaceId: string,
  standardId: string | null,
): Promise<LabSession> {
  const { data, error } = await supabase.functions.invoke("vision-benchmark", {
    body: { action: "lab-session-start", workspaceId, standardId: standardId ?? undefined },
  });
  if (error) throw error;
  return data as LabSession;
}

export interface LabAttempt {
  ok: boolean;
  attemptId?: string;
  attemptsUsed: number;
  attemptsLimit?: number;
  reason?: string;
}

/** Uma tentativa = uma foto = uma decisão final. */
export async function createLabAttempt(
  workspaceId: string,
  sessionId: string,
): Promise<LabAttempt> {
  const { data, error } = await supabase.functions.invoke("vision-benchmark", {
    body: { action: "lab-attempt-create", workspaceId, sessionId },
  });
  if (error) throw error;
  return data as LabAttempt;
}


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
    conditionStatus?: ConditionStatus | null;
    qualitySufficient: boolean | null;
    reasonCode: string | null;
    observations: string[];
    confidence: number | null;
    latencyMs: number;
  } | null;
  combined: {
    decision: LabDecision;
    reason_code: string;
    public_message: string;
    condition_status?: ConditionStatus | null;
    gate?: Record<string, boolean>;
    confidence?: number | null;
    confidence_threshold?: number | null;
  };
  /** Provedor que realmente decidiu esta execução. */
  provider?: LabProvider;
  modelId?: string;
  /** Detalhe estruturado, presente somente no provedor Gemini. */
  gemini?: {
    imageQuality: "good" | "dark" | "blurry" | "cropped" | "unusable";
    targetConfidence: number;
    referenceComparable: boolean;
    conditions: {
      condition: string;
      status: ConditionStatus;
      confidence: number;
      visible_evidence: string;
    }[];
    boundingBoxes: { x: number; y: number; w: number; h: number }[];
    suggestedDecision: "approved" | "retake" | "uncertain";
    /** Verdadeiro quando o servidor discordou da sugestão do modelo. */
    overridden: boolean;
  };
  referenceMode: "none" | "multi_image" | "derived";
  totalLatencyMs: number;
  budget?: BudgetInfo;
  usage?: UsageTotals;
}


// ---------------- ativação de padrão ----------------
// Sem gabarito manual: a liberação depende apenas de condições objetivas
// avaliadas no servidor e da confirmação do proprietário.

export interface ActivationCheck {
  key: string;
  label: string;
  ok: boolean;
}

export function activationChecks(s: VisualStandard): ActivationCheck[] {
  const profile = profileOf(s);
  const refs = s.references || [];
  const hasRef1 = refs.some(r => r.position === 1);
  const hasRef2 = refs.some(r => r.position === 2);
  
  return [
    { 
      key: "question", 
      label: "Pergunta vinculada", 
      ok: Boolean(s.question?.trim()) 
    },
    {
      key: "reference_1",
      label: "Referência principal válida",
      ok: hasRef1,
    },
    {
      key: "reference_2",
      label: "Ângulo complementar válido",
      ok: hasRef2,
    },
    {
      key: "accessible",
      label: "Referências acessíveis pelo servidor",
      ok: hasRef1 && hasRef2,
    },
    { 
      key: "profile", 
      label: "Perfil visual gerado", 
      ok: Boolean(profile) 
    },
    {
      key: "version",
      label: "Versão do perfil maior que zero",
      ok: (s.profile_version ?? 0) > 0,
    },
    {
      key: "verifiability",
      label: "Verificabilidade definida",
      ok: s.visual_verifiability === "verifiable",
    },
  ];
}

export function canActivate(s: VisualStandard): boolean {
  return activationChecks(s).every((c) => c.ok);
}

/** Ativação confirmada pelo proprietário. Não usa métricas manuais. */
export async function activateStandard(s: VisualStandard): Promise<VisualStandard> {
  const { data, error } = await supabase
    .from("visual_standards")
    .update({
      status: "validated",
      needs_validation: false,
      validated_question: s.question,
      last_validated_at: new Date().toISOString(),
    })

    .eq("id", s.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as VisualStandard;
}



export interface LiveStats {
  /** ms entre abrir a câmera e a primeira detecção real do alvo. */
  timeToTargetMs: number | null;
  liveChecks: number;
  avgLiveLatencyMs: number | null;
  strategy: "detect" | "point" | "query" | "none";
  /** Consumo somado da sessão de câmera (ao vivo + análise final). */
  neurons?: number;
  inputTokens?: number;
  outputTokens?: number;
  aiCalls?: number;
  localChecks?: number;
}

export interface LabRun extends LabResponse {
  id: string;
  at: string;
  question: string;
  /** Pergunta /Camera de origem — usado para filtrar o Desempenho. */
  cameraBlockId?: string | null;
  source?: "upload" | "camera_v3";
  live?: LiveStats | null;
}

export async function runBenchmark(input: {
  workspaceId: string;
  question: string;
  imageBase64: string;
  referenceBase64?: string | null;
  standardId?: string | null;
  profile?: StandardProfile | null;
  sessionId: string;
  attemptId: string;
  /** Seletor interno do laboratório. O servidor valida e decide. */
  provider?: LabProvider;
}): Promise<LabResponse> {
  const { data, error } = await supabase.functions.invoke("vision-benchmark", {
    body: {
      action: "benchmark-evaluate",
      workspaceId: input.workspaceId,
      question: input.question,
      imageBase64: input.imageBase64,
      // No provedor Gemini a referência é carregada pelo servidor a partir do
      // bucket privado — o cliente não envia imagem de referência.
      referenceBase64: (input.provider ?? DEFAULT_LAB_PROVIDER) === "google_gemini"
        ? undefined
        : (input.referenceBase64 ?? undefined),
      standardId: input.standardId ?? undefined,
      profile: input.profile ?? undefined,
      sessionId: input.sessionId,
      attemptId: input.attemptId,
      provider: input.provider ?? DEFAULT_LAB_PROVIDER,
    },
  });

  if (error) throw error;
  return data as LabResponse;
}


/** Gera o perfil interno e prepara o padrão no servidor. Somente após clique do proprietário. */
export async function prepareStandard(
  workspaceId: string,
  standardId: string,
): Promise<{ ok: boolean; status?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke("vision-benchmark", {
    body: { action: "profile-standard", workspaceId, standardId },
  });
  if (error) return { ok: false, message: error.message };
  return data as { ok: boolean; status?: string; message?: string };
}

export type LiveState = "searching" | "adjust" | "ready" | "uncertain";

export interface LocateResult {
  requestId: string | null;
  strategy: "detect" | "point" | "query" | "none";
  found: boolean;
  /** Caixas reais do modelo; vazio quando não há coordenadas confiáveis. */
  boxes: { x: number; y: number; w: number; h: number }[];
  state: LiveState;
  hintCode: string;
  hint: string;
  inferenceMs: number;
  budget?: BudgetInfo;
  usage?: UsageTotals;
}

/** Localização ao vivo — o frame é enviado em memória e nunca armazenado. */
export async function liveLocate(input: {
  workspaceId: string;
  standardId: string;
  frameBase64: string;
  requestId: string;
  sessionId: string;
}): Promise<LocateResult> {
  const { data, error } = await supabase.functions.invoke("vision-benchmark", {
    body: {
      action: "live-locate",
      workspaceId: input.workspaceId,
      standardId: input.standardId,
      frameBase64: input.frameBase64,
      requestId: input.requestId,
      sessionId: input.sessionId,
    },
  });
  if (error) throw error;
  return data as LocateResult;
}




/** Consumo somado das execuções registradas na sessão do laboratório. */
export interface UsageSummary {
  aiCalls: number;
  /** Somente Cloudflare. */
  neurons: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Valor teórico dos neurônios Cloudflare. */
  estimatedUsd: number;
  /** Custo teórico das chamadas Gemini, medido em tokens. */
  tokenCostUsd: number;
  runsWithUsage: number;
  avgNeuronsPerRun: number | null;
  localChecks: number;
}

export const USD_PER_1K_NEURONS = 0.011;

export function computeUsage(runs: LabRun[]): UsageSummary {
  let aiCalls = 0, neurons = 0, inputTokens = 0, outputTokens = 0, cachedTokens = 0;
  let tokenCostUsd = 0, runsWithUsage = 0, localChecks = 0;
  for (const r of runs) {
    if (r.usage) {
      runsWithUsage++;
      aiCalls += r.usage.calls ?? 0;
      neurons += r.usage.neurons ?? 0;
      inputTokens += r.usage.inputTokens ?? 0;
      outputTokens += r.usage.outputTokens ?? 0;
      cachedTokens += r.usage.cachedTokens ?? 0;
      tokenCostUsd += r.usage.costUsd ?? 0;
    }
    localChecks += r.live?.localChecks ?? 0;
  }
  return {
    aiCalls,
    neurons: Math.round(neurons * 1000) / 1000,
    inputTokens,
    outputTokens,
    cachedTokens,
    estimatedUsd: Math.round((neurons / 1000) * USD_PER_1K_NEURONS * 1e6) / 1e6,
    tokenCostUsd: Math.round(tokenCostUsd * 1e8) / 1e8,
    runsWithUsage,
    avgNeuronsPerRun: runsWithUsage ? Math.round((neurons / runsWithUsage) * 1000) / 1000 : null,
    localChecks,
  };
}


// ---------------- métricas operacionais da sessão ----------------
// Somente o que a própria execução produz. Sem gabarito manual, não existe
// acurácia, falsa aprovação nem falsa reprovação honestas.

export interface SessionMetrics {
  total: number;
  approved: number;
  retake: number;
  uncertain: number;
  technicalFailures: number;
  avgConfidence: number | null;
  avgLatencyMs: number | null;
  withReference: number;
  withoutReference: number;
  providers: string[];
  models: string[];
}

export function computeMetrics(runs: LabRun[]): SessionMetrics {
  const total = runs.length;
  let approved = 0, retake = 0, uncertain = 0, failures = 0;
  let latencySum = 0, withRef = 0, confSum = 0, confCount = 0;
  const providers = new Set<string>();
  const models = new Set<string>();

  for (const r of runs) {
    const d = r.combined.decision;
    if (d === "approved") approved++;
    else if (d === "retake") retake++;
    else if (d === "uncertain") uncertain++;
    else failures++;

    const conf = r.combined.confidence ?? r.judge?.confidence ?? null;
    if (typeof conf === "number") { confSum += conf; confCount++; }
    latencySum += r.totalLatencyMs;
    if (r.referenceMode !== "none") withRef++;
    if (r.provider) providers.add(r.provider);
    if (r.modelId) models.add(r.modelId);
  }

  return {
    total,
    approved,
    retake,
    uncertain,
    technicalFailures: failures,
    avgConfidence: confCount ? confSum / confCount : null,
    avgLatencyMs: total ? Math.round(latencySum / total) : null,
    withReference: withRef,
    withoutReference: total - withRef,
    providers: [...providers],
    models: [...models],
  };
}

/** Exportação sem imagens, base64, URLs, tokens ou resposta bruta. */
export function exportRows(runs: LabRun[]) {
  return runs.map((r) => ({
    at: r.at,
    question: r.question,
    confidence: r.combined.confidence ?? r.judge?.confidence ?? null,
    combined_decision: r.combined.decision,
    condition_status: r.combined.condition_status ?? null,
    reason_code: r.combined.reason_code,
    judge_decision: r.judge?.decision ?? null,
    observer_target_visible: r.observer?.targetVisible ?? null,
    observer_blurry: r.observer?.blurry ?? null,
    observer_dark: r.observer?.dark ?? null,
    reference_mode: r.referenceMode,
    source: r.source ?? "upload",
    provider: r.provider ?? null,
    model_id: r.modelId ?? null,
    suggested_decision: r.gemini?.suggestedDecision ?? null,
    server_overrode_model: r.gemini?.overridden ?? null,
    ai_calls: r.usage?.calls ?? null,
    input_tokens: r.usage?.inputTokens ?? null,
    output_tokens: r.usage?.outputTokens ?? null,
    cached_tokens: r.usage?.cachedTokens ?? null,
    neurons: r.usage?.neurons ?? null,
    token_cost_usd: r.usage?.costUsd ?? null,
    estimated_usd: r.usage?.estimatedUsd ?? null,

    live_ai_checks: r.live?.liveChecks ?? null,
    local_checks: r.live?.localChecks ?? null,
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
