import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BLOCK_STATUS_LABEL,
  blockStandardStatus,
  type BlockStandardStatus,
  type VisualStandard,
} from "@/lib/visual-standards";

/**
 * Status do padrão visual de um bloco /Camera dentro do editor de checklist.
 * Somente leitura de metadados — nenhuma inferência de IA é executada aqui.
 */
export function CameraStandardStatus({
  checklistId,
  cameraBlockId,
}: {
  checklistId: string | null;
  cameraBlockId: string | null;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BlockStandardStatus>("none");
  const [loading, setLoading] = useState(false);
  const [questionChanged, setQuestionChanged] = useState(false);
  const [snapshotOutdated, setSnapshotOutdated] = useState(false);

  const load = useCallback(async () => {
    if (!checklistId || !cameraBlockId) return;
    setLoading(true);
    const { data } = await supabase
      .from("visual_standards")
      .select("*")
      .eq("checklist_id", checklistId)
      .eq("camera_block_id", cameraBlockId)
      .is("archived_at", null)
      .maybeSingle();
    const s = (data as VisualStandard | null) ?? null;
    setStatus(blockStandardStatus(s));
    setQuestionChanged(Boolean(s?.validated_question && s.validated_question !== s.question));

    // Somente leitura: detecta snapshot publicado antes do padrão visual.
    // Nunca republica nem injeta cameraBlockId silenciosamente.
    const { data: cl } = await supabase
      .from("checklists")
      .select("is_published, published_content")
      .eq("id", checklistId)
      .maybeSingle();
    const published = (cl as any)?.published_content ?? null;
    setSnapshotOutdated(
      Boolean((cl as any)?.is_published && published && !JSON.stringify(published).includes(cameraBlockId)),
    );
    setLoading(false);
  }, [checklistId, cameraBlockId]);


  useEffect(() => { void load(); }, [load]);

  // Ao voltar de /padrao a aba recupera o foco: o status é relido.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const tone =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "validating"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-neutral-50 text-neutral-600 border-neutral-200";

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
        Padrão visual
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {BLOCK_STATUS_LABEL[status]}
        </span>
        <button
          type="button"
          disabled={!checklistId || !cameraBlockId}
          onClick={() =>
            navigate({
              to: "/padrao",
              search: { checklist: checklistId ?? undefined, block: cameraBlockId ?? undefined },
            })
          }
          className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Configurar padrão visual
        </button>
      </div>
      {questionChanged && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          A pergunta foi alterada. Revise o padrão visual antes de ativá-lo novamente.
        </p>
      )}
      {!checklistId && (
        <p className="text-[11px] text-neutral-500">Salve o checklist para configurar o padrão visual.</p>
      )}
    </div>
  );
}
