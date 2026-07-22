import { supabase } from "@/integrations/supabase/client";
import { VISION_BUCKET, type Dataset } from "@/lib/vision-datasets";

export type Classification = "normal" | "anomalous" | "ignored";

export interface CuratedImage {
  id: string;
  dataset_id: string;
  evidence_id: string | null;
  checklist_evidence_id: string | null;
  classification: Classification;
  source_storage_path: string;
  curated_storage_path: string | null;
  sha256: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
  note: string | null;
  split: "train" | "validation" | "test" | null;
  dataset_version: string | null;
  response_id: string | null;
  checklist_id: string | null;
  block_id: string | null;
  organization_id: string | null;
  unit_id: string | null;
}

const EVIDENCE_BUCKET = "evidences";
const CHECKLIST_EVIDENCE_BUCKET = "checklist-evidences";

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extFromPath(path: string, contentType?: string): string {
  const m = path.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  if (m) return m[1].toLowerCase();
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}

// Defesa contra path traversal / caracteres inválidos ao compor caminhos de Storage.
// UUIDs e slugs já normalizados passam intactos; qualquer outra coisa é rejeitada.
function safeSegment(v: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) {
    throw new Error("invalid_storage_segment");
  }
  return v;
}

/** Lista curadoria por evidência (para exibir estado na página de Envios). */
export async function listCuratedForEvidences(
  evidenceIds: string[],
): Promise<Record<string, CuratedImage>> {
  if (evidenceIds.length === 0) return {};
  const { data, error } = await supabase
    .from("vision_curated_images")
    .select("*")
    .in("evidence_id", evidenceIds);
  if (error) throw error;
  const map: Record<string, CuratedImage> = {};
  for (const row of (data ?? []) as CuratedImage[]) {
    if (row.evidence_id) map[row.evidence_id] = row;
  }
  return map;
}

/** Lista curadoria por evidência de checklist (bloco Câmera). */
export async function listCuratedForChecklistEvidences(
  checklistEvidenceIds: string[],
): Promise<Record<string, CuratedImage>> {
  if (checklistEvidenceIds.length === 0) return {};
  const { data, error } = await supabase
    .from("vision_curated_images")
    .select("*")
    .in("checklist_evidence_id", checklistEvidenceIds);
  if (error) throw error;
  const map: Record<string, CuratedImage> = {};
  for (const row of (data ?? []) as CuratedImage[]) {
    if (row.checklist_evidence_id) map[row.checklist_evidence_id] = row;
  }
  return map;
}

export async function listDatasets(): Promise<Dataset[]> {
  const { data, error } = await supabase
    .from("vision_datasets")
    .select("id, slug, public_id, name, description, normal_instructions, anomaly_instructions, examples, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Dataset[];
}

/**
 * Classifica uma evidência para o dataset. Copia o arquivo para o bucket
 * `vision-datasets` (fatia de curadoria isolada da evidência original) apenas
 * quando a classificação é `normal` ou `anomalous`.
 */
export async function classifyEvidence(input: {
  evidence: { id: string; storage_path: string; response_id?: string | null; task_id?: string | null; organization_id?: string | null; unit_id?: string | null };
  datasetId: string;
  datasetSlug: string;
  classification: Classification;
  note?: string | null;
}): Promise<CuratedImage> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");

  let curatedPath: string | null = null;
  let sha: string | null = null;

  if (input.classification !== "ignored") {
    // Baixa a evidência via signed URL, calcula hash e replica no bucket de datasets.
    const { data: signed, error: signErr } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(input.evidence.storage_path, 60);
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Falha ao gerar URL da evidência.");

    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) throw new Error("Não foi possível baixar a evidência original.");
    const contentType = resp.headers.get("content-type") ?? "image/jpeg";
    const buffer = await resp.arrayBuffer();
    sha = await sha256Hex(buffer);
    const ext = extFromPath(input.evidence.storage_path, contentType);
    // Novos arquivos curados são endereçados pelo UUID do dataset (imutável).
    // O slug fica apenas como metadado legível — renomear o padrão não quebra este caminho.
    curatedPath = `${safeSegment(input.datasetId)}/curated/${input.classification}/${sha}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(VISION_BUCKET)
      .upload(curatedPath, new Blob([buffer], { type: contentType }), {
        contentType,
        upsert: true,
      });
    if (upErr) throw upErr;
  }

  const payload = {
    dataset_id: input.datasetId,
    evidence_id: input.evidence.id,
    classification: input.classification,
    source_storage_path: input.evidence.storage_path,
    curated_storage_path: curatedPath,
    sha256: sha,
    response_id: input.evidence.response_id ?? null,
    checklist_id: null,
    block_id: null,
    organization_id: input.evidence.organization_id ?? null,
    unit_id: input.evidence.unit_id ?? null,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    note: input.note?.trim() ? input.note.trim() : null,
  };

  const { data, error } = await supabase
    .from("vision_curated_images")
    .upsert(payload, { onConflict: "dataset_id,evidence_id" })
    .select()
    .single();
  if (error) throw error;
  return data as CuratedImage;
}

/**
 * Classifica uma evidência de checklist (bloco Câmera) para um dataset.
 * Copia a imagem do bucket `checklist-evidences` para o bucket privado
 * `vision-datasets`, mantendo a original intacta.
 */
export async function classifyChecklistEvidence(input: {
  evidence: {
    id: string;
    storage_path: string;
    checklist_id?: string | null;
    response_id?: string | null;
    block_id?: string | null;
    origin_bucket?: string | null;
  };
  datasetId: string;
  datasetSlug: string;
  classification: Classification;
  note?: string | null;
}): Promise<CuratedImage> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");

  let curatedPath: string | null = null;
  let sha: string | null = null;

  if (input.classification !== "ignored") {
    const sourceBucket = input.evidence.origin_bucket || CHECKLIST_EVIDENCE_BUCKET;
    const { data: signed, error: signErr } = await supabase.storage
      .from(sourceBucket)
      .createSignedUrl(input.evidence.storage_path, 60);
    if (signErr || !signed?.signedUrl) {
      throw signErr ?? new Error("Falha ao gerar URL da evidência.");
    }
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) throw new Error("Não foi possível baixar a imagem original.");
    const contentType = resp.headers.get("content-type") ?? "image/jpeg";
    const buffer = await resp.arrayBuffer();
    sha = await sha256Hex(buffer);
    const ext = extFromPath(input.evidence.storage_path, contentType);
    curatedPath = `${safeSegment(input.datasetId)}/curated/${input.classification}/${sha}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(VISION_BUCKET)
      .upload(curatedPath, new Blob([buffer], { type: contentType }), {
        contentType,
        upsert: true,
      });
    if (upErr) throw upErr;
  }

  const payload = {
    dataset_id: input.datasetId,
    evidence_id: null as string | null,
    checklist_evidence_id: input.evidence.id,
    classification: input.classification,
    source_storage_path: input.evidence.storage_path,
    curated_storage_path: curatedPath,
    sha256: sha,
    response_id: input.evidence.response_id ?? null,
    checklist_id: input.evidence.checklist_id ?? null,
    block_id: input.evidence.block_id ?? null,
    organization_id: null,
    unit_id: null,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    note: input.note?.trim() ? input.note.trim() : null,
  };

  const { data, error } = await supabase
    .from("vision_curated_images")
    .upsert(payload, { onConflict: "dataset_id,checklist_evidence_id" })
    .select()
    .single();
  if (error) throw error;
  return data as CuratedImage;
}

/** Conta imagens curadas por classificação em um dataset. */
export async function countCuratedByDataset(
  datasetId: string,
): Promise<{ normal: number; anomalous: number; ignored: number; total: number }> {
  const out = { normal: 0, anomalous: 0, ignored: 0, total: 0 };
  const { data, error } = await supabase
    .from("vision_curated_images")
    .select("classification")
    .eq("dataset_id", datasetId);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ classification: Classification }>) {
    out[row.classification]++;
    out.total++;
  }
  return out;
}

/** Remove a classificação (e o arquivo copiado, se houver). */
export async function undoClassification(curated: CuratedImage): Promise<void> {
  if (curated.curated_storage_path) {
    await supabase.storage.from(VISION_BUCKET).remove([curated.curated_storage_path]);
  }
  const { error } = await supabase
    .from("vision_curated_images")
    .delete()
    .eq("id", curated.id);
  if (error) throw error;
}

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  normal: "Aprovada como padrão correto",
  anomalous: "Marcada como anomalia",
  ignored: "Ignorada para treinamento",
};