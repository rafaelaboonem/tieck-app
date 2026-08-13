import { supabase } from "@/integrations/supabase/client";

/**
 * Perguntas /Camera vivem dentro de `checklists.blocks` (jsonb). Cada bloco
 * Camera carrega um `cameraBlockId` UUID estável — criado uma única vez na
 * inserção do bloco e preservado ao mover, renomear ou reordenar.
 */
export interface CameraQuestion {
  /** UUID estável do bloco. Nunca derivado do texto nem da posição. */
  cameraBlockId: string;
  /** id curto interno do editor (uso apenas no próprio editor). */
  blockId: string;
  question: string;
  index: number;
}

export interface ChecklistProject {
  id: string;
  title: string;
  cameraBlocks: CameraQuestion[];
}

type AnyBlock = Record<string, unknown>;

export function isCameraBlock(block: AnyBlock): boolean {
  return block?.["type"] === "camera";
}

export function cameraQuestionText(block: AnyBlock): string {
  const title = String(block?.["title"] ?? "").trim();
  const description = String(block?.["description"] ?? "").trim();
  return title || description || "Pergunta sem título";
}

/**
 * Garante `cameraBlockId` em todo bloco Camera. Retorna `changed` para que o
 * chamador persista somente quando algo realmente foi criado (backfill seguro).
 */
export function ensureCameraBlockIds<T extends AnyBlock>(blocks: T[]): { blocks: T[]; changed: boolean } {
  let changed = false;
  const out = blocks.map((b) => {
    if (!isCameraBlock(b) || typeof b["cameraBlockId"] === "string") return b;
    changed = true;
    return { ...b, cameraBlockId: crypto.randomUUID() };
  });
  return { blocks: out as T[], changed };
}

/** Duplicar um bloco/checklist gera novos IDs — nunca reaproveita o vínculo. */
export function withNewCameraBlockId<T extends AnyBlock>(block: T): T {
  if (!isCameraBlock(block)) return block;
  return { ...block, cameraBlockId: crypto.randomUUID() } as T;
}

export function extractCameraQuestions(blocks: AnyBlock[]): CameraQuestion[] {
  const out: CameraQuestion[] = [];
  blocks.forEach((b, index) => {
    if (!isCameraBlock(b)) return;
    const cameraBlockId = b["cameraBlockId"];
    if (typeof cameraBlockId !== "string" || !cameraBlockId) return;
    out.push({
      cameraBlockId,
      blockId: String(b["id"] ?? ""),
      question: cameraQuestionText(b),
      index,
    });
  });
  return out;
}

/**
 * Projetos (checklists) visíveis pela sessão. A RLS decide o que retorna;
 * aqui apenas restringimos ao workspace atual (ou aos checklists pessoais,
 * ainda sem workspace atribuído).
 */
export async function listChecklistProjects(workspaceId: string): Promise<ChecklistProject[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select("id, title, blocks, workspace_id")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .filter((c: any) => c.workspace_id === workspaceId || c.workspace_id === null)
    .map((c: any) => ({
      id: c.id as string,
      title: (c.title as string | null)?.trim() || "Sem título",
      cameraBlocks: extractCameraQuestions(Array.isArray(c.blocks) ? (c.blocks as AnyBlock[]) : []),
    }));
}

export async function getChecklistCameraQuestions(checklistId: string): Promise<CameraQuestion[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select("blocks")
    .eq("id", checklistId)
    .maybeSingle();
  if (error) throw error;
  return extractCameraQuestions(Array.isArray(data?.blocks) ? (data!.blocks as AnyBlock[]) : []);
}
