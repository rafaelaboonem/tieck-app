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
