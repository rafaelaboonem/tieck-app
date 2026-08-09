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
  checklist_id?: string | null;
  camera_block_id?: string | null;
  archived_at?: string | null;
  needs_validation?: boolean;
}

export async function fetchStandards(workspaceId: string) {
  const { data, error } = await supabase
    .from("visual_standards")
    .select("*, references:visual_standard_references(*)")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as VisualStandard[];
}

export async function createStandard(params: {
  workspaceId: string;
  checklistId?: string;
  cameraBlockId?: string;
  question: string;
  internalNotes?: string;
  referenceFile?: File | null;
}) {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("visual_standards")
    .insert({
      workspace_id: params.workspaceId,
      created_by: user.user?.id || '00000000-0000-0000-0000-000000000000',
      checklist_id: params.checklistId,
      camera_block_id: params.cameraBlockId,
      question: params.question,
      name: params.question.slice(0, 120),
      internal_notes: params.internalNotes,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;

  if (params.referenceFile && data) {
    await uploadReference(data as VisualStandard, params.referenceFile, 1);
  }

  return data;
}

export async function syncStandardsWithBlocks(params: {
  checklistId: string;
  blocks: { cameraBlockId: string; question: string }[];
}) {
  const { data: existing, error: fetchErr } = await supabase
    .from("visual_standards")
    .select("*")
    .eq("checklist_id", params.checklistId);

  if (fetchErr) throw fetchErr;

  let revalidate = 0;
  let archived = 0;
  let restored = 0;

  for (const raw of (existing || [])) {
    const current = params.blocks.find((b) => b.cameraBlockId === raw.camera_block_id)?.question;
    
    if (!current) {
      if (!raw.archived_at) {
        await supabase
          .from("visual_standards")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", raw.id);
        archived++;
      }
      continue;
    }

    const patch: any = {};
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

export async function uploadReference(
  standard: VisualStandard,
  file: File,
  position: 1 | 2 = 1
): Promise<VisualStandardReference> {
  const path = `${standard.workspace_id}/${standard.id}/reference-${position}.${extFor(file)}`;
  
  const { error: upErr } = await supabase.storage
    .from(STANDARDS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) throw upErr;

  try {
    const existing = standard.references?.find(r => r.position === position);

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

    if (existing && existing.storage_path !== path) {
      await supabase.storage.from(STANDARDS_BUCKET).remove([existing.storage_path]);
    }

    if (position === 1) {
      await supabase
        .from("visual_standards")
        .update({ reference_path: path })
        .eq("id", standard.id);
    }

    return data as VisualStandardReference;
  } catch (err) {
    await supabase.storage.from(STANDARDS_BUCKET).remove([path]);
    throw err;
  }
}

export async function deleteReference(standard: VisualStandard, reference: VisualStandardReference) {
  const { error: dbErr } = await supabase
    .from("visual_standard_references")
    .delete()
    .eq("id", reference.id);
  if (dbErr) throw dbErr;

  const { error: stErr } = await supabase.storage
    .from(STANDARDS_BUCKET)
    .remove([reference.storage_path]);
  
  if (reference.position === 1) {
    await supabase
      .from("visual_standards")
      .update({ reference_path: null })
      .eq("id", standard.id);
  }
}

/** @deprecated IA Legada desativada */
export async function prepareStandard(standardId: string): Promise<void> {
  console.warn("prepareStandard is disabled (Legacy IA removed)");
  return;
}

/** @deprecated IA Legada desativada */
export async function activateStandard(standardId: string): Promise<void> {
  console.warn("activateStandard is disabled (Legacy IA removed)");
  return;
}
