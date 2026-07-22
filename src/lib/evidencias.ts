import { supabase } from "@/integrations/supabase/client";

export type EvidenceStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "resubmit_requested"
  | "manual_review"
  | "analysis_failed";
export type ReviewAction =
  | "approve"
  | "reject"
  | "request_resubmit"
  | "note"
  | "corrective_action"
  | "nonconformity";

export interface EvidenceRow {
  id: string;
  organization_id: string;
  unit_id: string;
  shift_id: string | null;
  task_id: string | null;
  storage_path: string;
  reference_path: string | null;
  submitted_by: string | null;
  submitted_at: string;
  status: EvidenceStatus;
  task_execution_id: string;
}

export interface EvidenceWithUrls extends EvidenceRow {
  sentUrl: string | null;
  referenceUrl: string | null;
}

const BUCKET = "evidences";
const SIGNED_TTL_SECONDS = 60 * 10; // 10 minutos

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function buildPath(params: {
  organizationId: string;
  unitId: string;
  taskId: string;
  fileName: string;
}) {
  const now = new Date();
  return `${params.organizationId}/${params.unitId}/${now.getFullYear()}/${pad(
    now.getMonth() + 1,
  )}/${params.taskId}/${params.fileName}`;
}

export async function uploadEvidence(input: {
  file: File;
  organizationId: string;
  unitId: string;
  taskId: string;
  taskExecutionId: string;
  shiftId?: string | null;
  referencePath?: string | null;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");

  const ext = input.file.name.split(".").pop() || "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = buildPath({
    organizationId: input.organizationId,
    unitId: input.unitId,
    taskId: input.taskId,
    fileName,
  });

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("evidences")
    .insert({
      organization_id: input.organizationId,
      unit_id: input.unitId,
      shift_id: input.shiftId ?? null,
      task_id: input.taskId,
      task_execution_id: input.taskExecutionId,
      storage_path: path,
      reference_path: input.referencePath ?? null,
      submitted_by: userId,
    })
    .select()
    .single();
  if (error) {
    // rollback do arquivo se o insert falhar
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  const created = data as EvidenceRow;

  // Dispara análise por IA em background — falha aqui não bloqueia o upload.
  void supabase.functions
    .invoke("analyze-task-evidence", { body: { evidenceId: created.id } })
    .catch(() => {
      /* silencioso: Realtime atualizará o status quando a análise concluir */
    });

  return created;
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

export async function listPendingEvidences(limit = 50): Promise<EvidenceWithUrls[]> {
  const { data, error } = await supabase
    .from("evidences")
    .select("*")
    .eq("status", "pending")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as EvidenceRow[];
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      sentUrl: await signedUrl(r.storage_path),
      referenceUrl: await signedUrl(r.reference_path),
    })),
  );
}

/** Mapa entre ação do revisor e o novo status da evidência. */
const ACTION_TO_STATUS: Record<ReviewAction, EvidenceStatus | null> = {
  approve: "approved",
  reject: "rejected",
  request_resubmit: "resubmit_requested",
  note: null, // não muda status
  corrective_action: "rejected",
  nonconformity: "rejected",
};

export async function reviewEvidence(input: {
  evidenceId: string;
  action: ReviewAction;
  note?: string | null;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const reviewerId = userRes.user?.id;
  if (!reviewerId) throw new Error("Usuário não autenticado.");

  const { error: revErr } = await supabase.from("evidence_reviews").insert({
    evidence_id: input.evidenceId,
    reviewer_id: reviewerId,
    action: input.action,
    note: input.note ?? null,
  });
  if (revErr) throw revErr;

  const newStatus = ACTION_TO_STATUS[input.action];
  if (newStatus) {
    const { error: upErr } = await supabase
      .from("evidences")
      .update({ status: newStatus })
      .eq("id", input.evidenceId);
    if (upErr) throw upErr;
  }
}