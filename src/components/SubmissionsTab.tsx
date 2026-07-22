import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, Inbox, ChevronDown, ChevronRight, FileText, Trash2, ChevronLeft, X, Lock, Sparkles, RefreshCcw, Images, Brain, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  classifyChecklistEvidence,
  listCuratedForChecklistEvidences,
  listDatasets,
  undoClassification,
  type Classification,
  type CuratedImage,
} from "@/lib/curated-images";
import type { Dataset } from "@/lib/vision-datasets";
import { CompareTab } from "./CompareTab";

type ResponseRow = {
  id: string;
  visitor_id: string;
  created_at: string;
  expires_at: string;
  answers: Record<string, any>;
};

type PartialRow = {
  id: string;
  visitor_id: string;
  started_at: string;
  last_active_at: string;
  submitted_at: string | null;
  metadata: any;
};

type Filter = "todos" | "completo" | "parcial" | "comparar";

type ChecklistEvidenceInfo = {
  id: string;
  storage_path: string;
  response_id: string | null;
  checklist_id: string;
  block_id: string;
  source?: string | null;
  origin_bucket?: string | null;
};

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  normal: "Padrão correto",
  anomalous: "Problema / anomalia",
  ignored: "Ignorar",
};

const CLASSIFICATION_TONE: Record<Classification, string> = {
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  anomalous: "bg-amber-50 text-amber-800 border-amber-200",
  ignored: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

export function SubmissionsTab({
  checklistId,
  onRetentionChange,
}: {
  checklistId: string;
  onRetentionChange?: (enabled: boolean, days: number) => void;
}) {
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [partials, setPartials] = useState<PartialRow[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [retention, setRetention] = useState<number>(3);
  const [isRetentionEnabled, setIsRetentionEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todos");
  const [planType, setPlanType] = useState<string>("free");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    images: string[];
    labels: string[];
    currentIndex: number;
  }>({
    isOpen: false,
    images: [],
    labels: [],
    currentIndex: 0,
  });
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  // Curadoria para IA (Envios ↔ padrão visual)
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [checklistEvidences, setChecklistEvidences] = useState<Record<string, ChecklistEvidenceInfo>>({});
  // Índice auxiliar: `${response_id}::${block_id}` → evidence. Cobre respostas antigas
  // cujo answer não contém `evidenceId` mas ainda existem em `checklist_evidences`.
  const [evidenceByRespBlock, setEvidenceByRespBlock] = useState<Record<string, ChecklistEvidenceInfo>>({});
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const [curatedByEvidence, setCuratedByEvidence] = useState<Record<string, CuratedImage>>({});
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [trainingModal, setTrainingModal] = useState<{
    evidence: ChecklistEvidenceInfo;
    previewUrl?: string;
  } | null>(null);
  const [modalDatasetId, setModalDatasetId] = useState("");
  const [modalClassification, setModalClassification] = useState<Classification>("normal");
  const [modalNote, setModalNote] = useState("");
  const [modalBusy, setModalBusy] = useState(false);

  const fetchSubmissions = async (isManual = false) => {
    try {
      setLoading(true);
      const [chk, resp, ana, { data: { user } }] = await Promise.all([
        supabase.from("checklists").select("blocks,settings,user_id").eq("id", checklistId).single(),
        supabase
          .from("checklist_responses")
          .select("id,visitor_id,created_at,expires_at,answers")
          .eq("checklist_id", checklistId)
          .not("submitted_at", "is", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("checklist_analytics")
          .select("id,visitor_id,started_at,last_active_at,submitted_at,metadata")
          .eq("checklist_id", checklistId)
          .is("submitted_at", null)
          .order("started_at", { ascending: false }),
        supabase.auth.getUser(),
      ]);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .single();
        if (profile) setPlanType(profile.plan_type || "free");
      }
      setBlocks((chk.data?.blocks as any[]) || []);
      const settings = (chk.data?.settings as any) || {};
      const hydratedDays = Number(settings.retentionDays) || 3;
      const hydratedEnabled = settings.dataRetention === true;
      setRetention(hydratedDays);
      setIsRetentionEnabled(hydratedEnabled);
      onRetentionChange?.(hydratedEnabled, hydratedDays);
      setResponses((resp.data ?? []) as ResponseRow[]);
      const partialRows = ((ana.data ?? []) as PartialRow[]).filter(
        (p) => p.metadata && Object.keys(p.metadata?.partial_answers || {}).length > 0
      );
      setPartials(partialRows);
      // Hidrata evidências de câmera + curadoria para o painel "Usar para treinar a IA".
      await hydrateTrainingData((resp.data ?? []) as ResponseRow[]);
      
      if (isManual) {
        toast.success("Dados sincronizados!");
      }
    } catch (error) {
      console.error("Error fetching submissions:", error);
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [checklistId]);

  // Carrega a lista de padrões visuais uma única vez.
  useEffect(() => {
    listDatasets().then(setDatasets).catch(() => undefined);
  }, []);

  const hydrateTrainingData = async (rows: ResponseRow[]) => {
    const evidenceIds = new Set<string>();
    for (const r of rows) {
      for (const v of Object.values(r.answers || {})) {
        if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).evidenceId === "string") {
          evidenceIds.add((v as any).evidenceId);
        }
      }
    }
    const responseIds = rows.map((r) => r.id);
    const ids = Array.from(evidenceIds);
    if (ids.length === 0 && responseIds.length === 0) {
      setChecklistEvidences({});
      setEvidenceByRespBlock({});
      setCuratedByEvidence({});
      return;
    }
    // Busca evidências por id (novo formato) e por response_id (legado, sem evidenceId).
    const [evByIdRes, evByRespRes] = await Promise.all([
      ids.length > 0
        ? supabase
            .from("checklist_evidences")
            .select("id, storage_path, response_id, checklist_id, block_id, source, origin_bucket")
            .in("id", ids)
        : Promise.resolve({ data: [] as ChecklistEvidenceInfo[] }),
      responseIds.length > 0
        ? supabase
            .from("checklist_evidences")
            .select("id, storage_path, response_id, checklist_id, block_id, source, origin_bucket")
            .in("response_id", responseIds)
        : Promise.resolve({ data: [] as ChecklistEvidenceInfo[] }),
    ]);
    const byId: Record<string, ChecklistEvidenceInfo> = {};
    const byRespBlock: Record<string, ChecklistEvidenceInfo> = {};
    const allRows: ChecklistEvidenceInfo[] = [
      ...(((evByIdRes as any).data ?? []) as ChecklistEvidenceInfo[]),
      ...(((evByRespRes as any).data ?? []) as ChecklistEvidenceInfo[]),
    ];
    for (const row of allRows) {
      byId[row.id] = row;
      if (row.response_id && row.block_id) {
        byRespBlock[`${row.response_id}::${row.block_id}`] = row;
      }
    }
    const allIds = Object.keys(byId);
    const curated = allIds.length
      ? await listCuratedForChecklistEvidences(allIds).catch(
          () => ({} as Record<string, CuratedImage>),
        )
      : {};
    setChecklistEvidences(byId);
    setEvidenceByRespBlock(byRespBlock);
    setCuratedByEvidence(curated);

    // Resolve nomes dos revisores para a auditoria dos selos.
    const reviewerIds = Array.from(
      new Set(
        Object.values(curated)
          .map((c) => c.reviewed_by)
          .filter((v): v is string => !!v),
      ),
    );
    if (reviewerIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name")
        .in("id", reviewerIds);
      const nm: Record<string, string> = {};
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null }>) {
        const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        nm[p.id] = p.display_name || full || p.id.slice(0, 8);
      }
      setReviewerNames(nm);
    }
  };

  const ensureEvidenceUrl = async (info: ChecklistEvidenceInfo): Promise<string | null> => {
    if (evidenceUrls[info.id]) return evidenceUrls[info.id];
    const bucket = info.origin_bucket || "checklist-evidences";
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(info.storage_path, 60 * 30);
    if (error || !data?.signedUrl) return null;
    setEvidenceUrls((m) => ({ ...m, [info.id]: data.signedUrl }));
    return data.signedUrl;
  };

  const openTrainingModal = async (info: ChecklistEvidenceInfo) => {
    const existing = curatedByEvidence[info.id];
    setModalDatasetId(existing?.dataset_id || datasets[0]?.id || "");
    setModalClassification((existing?.classification as Classification) || "normal");
    setModalNote(existing?.note ?? "");
    const url = (await ensureEvidenceUrl(info)) ?? undefined;
    setTrainingModal({ evidence: info, previewUrl: url });
  };

  const closeTrainingModal = () => {
    if (modalBusy) return;
    setTrainingModal(null);
    setModalNote("");
  };

  const submitTraining = async () => {
    if (!trainingModal) return;
    if (!modalDatasetId) {
      toast.error("Selecione um padrão visual.");
      return;
    }
    const ds = datasets.find((d) => d.id === modalDatasetId);
    if (!ds) return;
    setModalBusy(true);
    try {
      const result = await classifyChecklistEvidence({
        evidence: {
          id: trainingModal.evidence.id,
          storage_path: trainingModal.evidence.storage_path,
          checklist_id: trainingModal.evidence.checklist_id,
          response_id: trainingModal.evidence.response_id,
          block_id: trainingModal.evidence.block_id,
          origin_bucket: trainingModal.evidence.origin_bucket,
        },
        datasetId: ds.id,
        datasetSlug: ds.slug,
        classification: modalClassification,
        note: modalNote,
      });
      setCuratedByEvidence((m) => ({ ...m, [trainingModal.evidence.id]: result }));
      toast.success("Imagem incluída no dataset. O treinamento não é iniciado automaticamente.");
      setTrainingModal(null);
      setModalNote("");
    } catch (err: any) {
      console.error("[training] classify failed", err);
      toast.error(err?.message || "Falha ao aprovar imagem para treinamento.");
    } finally {
      setModalBusy(false);
    }
  };

  const undoTraining = async () => {
    if (!trainingModal) return;
    const existing = curatedByEvidence[trainingModal.evidence.id];
    if (!existing) return;
    setModalBusy(true);
    try {
      await undoClassification(existing);
      setCuratedByEvidence((m) => {
        const next = { ...m };
        delete next[trainingModal.evidence.id];
        return next;
      });
      toast.success("Aprovação desfeita.");
      setTrainingModal(null);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao desfazer aprovação.");
    } finally {
      setModalBusy(false);
    }
  };

  const toggleRetention = async (enabled: boolean) => {
    setIsRetentionEnabled(enabled);
    onRetentionChange?.(enabled, retention);
    const { error } = await supabase.rpc("update_checklist_retention", {
      p_checklist_id: checklistId,
      p_retention_days: retention,
      p_is_enabled: enabled
    });

    if (error) {
      toast.error("Erro ao atualizar retenção");
      console.error(error);
      return;
    }
    
    // Reload responses to get updated expires_at
    const { data: updatedResp } = await supabase
      .from("checklist_responses")
      .select("id,visitor_id,created_at,expires_at,answers")
      .eq("checklist_id", checklistId)
      .order("created_at", { ascending: false });
    
    if (updatedResp) setResponses(updatedResp as ResponseRow[]);
    toast.success(enabled ? `Retenção de envios habilitada (${retention} dias)` : "Retenção de envios desabilitada");
  };

  const updateRetention = async (days: number) => {
    setRetention(days);
    onRetentionChange?.(isRetentionEnabled, days);
    const { error } = await supabase.rpc("update_checklist_retention", {
      p_checklist_id: checklistId,
      p_retention_days: days,
      p_is_enabled: isRetentionEnabled
    });

    if (error) {
      toast.error("Erro ao atualizar período");
      console.error(error);
      return;
    }

    // Reload responses
    const { data: updatedResp } = await supabase
      .from("checklist_responses")
      .select("id,visitor_id,created_at,expires_at,answers")
      .eq("checklist_id", checklistId)
      .order("created_at", { ascending: false });
    
    if (updatedResp) setResponses(updatedResp as ResponseRow[]);
    toast.success(`Respostas serão armazenadas por ${days} dias`);
  };

  const deleteResponse = async (id: string) => {
    await supabase.from("checklist_responses").delete().eq("id", id);
    setResponses((p) => p.filter((r) => r.id !== id));
    toast.success("Resposta excluída");
  };

  const counts = {
    todos: responses.length + partials.length,
    completo: responses.length,
    parcial: partials.length,
    comparar: responses.length,
  };

  const tabs: { id: Filter; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "completo", label: "Completo" },
    { id: "parcial", label: "Parcial" },
    { id: "comparar", label: "Comparar" },
  ];

  const formatDate = (iso: string) => {
    if (!iso) return "Permanente";
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "Permanente";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  };

  const labelForBlock = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    return b?.subtitle || b?.value || b?.placeholder || b?.type || id.slice(0, 8);
  };

  const identifyResponder = (answers: Record<string, any>): string | null => {
    const NAME_HINTS = ["nome", "name", "responsável", "responsavel", "colaborador", "email", "e-mail", "telefone", "phone"];
    for (const [blockId, value] of Object.entries(answers || {})) {
      if (typeof value !== "string" || !value.trim()) continue;
      const b = blocks.find((x) => x.id === blockId);
      const label = `${b?.subtitle ?? ""} ${b?.value ?? ""} ${b?.placeholder ?? ""} ${b?.type ?? ""}`.toLowerCase();
      if (NAME_HINTS.some((h) => label.includes(h))) return value.trim();
    }
    return null;
  };

  const summarizePhotos = (answers: Record<string, any>) => {
    let total = 0, reviewed = 0, pending = 0, evidenceCount = 0;
    for (const v of Object.values(answers || {})) {
      if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).evidenceId === "string") {
        total += 1; evidenceCount += 1;
        if (curatedByEvidence[(v as any).evidenceId]) reviewed += 1; else pending += 1;
        continue;
      }
      if (Array.isArray(v)) {
        for (const f of v) if (f?.url && (f.type || "").startsWith("image/")) total += 1;
      } else if (v && typeof v === "object" && (v as any).url && ((v as any).type || "").startsWith("image/")) {
        total += 1;
      }
    }
    return { total, reviewed, pending, evidenceCount };
  };

  const photoBadge = (s: { total: number; reviewed: number; pending: number; evidenceCount: number }) => {
    if (s.total === 0) return { label: "Sem fotos", tone: "bg-neutral-100 text-neutral-500 border-neutral-200" };
    if (s.evidenceCount === 0) return { label: `${s.total} foto${s.total > 1 ? "s" : ""}`, tone: "bg-neutral-50 text-neutral-600 border-neutral-200" };
    if (s.pending > 0) return { label: "Revisão pendente", tone: "bg-amber-50 text-amber-800 border-amber-200" };
    return { label: "Revisão concluída", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const openLightbox = (images: string[], index: number, labels?: string[]) => {
    setLightbox({
      isOpen: true,
      images,
      labels: labels && labels.length === images.length ? labels : images.map(() => ""),
      currentIndex: index,
    });
  };

  // Preload all images when lightbox opens to remove delay between navigations
  useEffect(() => {
    if (!lightbox.isOpen) return;
    lightbox.images.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [lightbox.isOpen, lightbox.images]);

  // Keyboard navigation (arrow keys) for the lightbox
  useEffect(() => {
    if (!lightbox.isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (lightbox.images.length <= 1) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setLightbox(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex + 1) % prev.images.length,
        }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLightbox(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length,
        }));
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [lightbox.isOpen, lightbox.images.length]);

  const collectImagesFromAnswers = (answers: Record<string, any>): { urls: string[]; labels: string[] } => {
    const urls: string[] = [];
    const labels: string[] = [];
    Object.entries(answers || {}).forEach(([blockId, v]: [string, any]) => {
      const lbl = labelForBlock(blockId);
      if (Array.isArray(v)) {
        v.forEach((f: any) => {
          if (f?.url && (f.type || "").startsWith("image/")) {
            urls.push(f.url);
            labels.push(lbl);
          }
        });
      } else if (v && typeof v === "object" && v.url && (v.type || "").startsWith("image/")) {
        urls.push(v.url);
        labels.push(lbl);
      }
    });
    return { urls, labels };
  };

  const renderAnswerValue = (
    v: any,
    blockLabel?: string,
    contextImages?: { urls: string[]; labels: string[] },
    evidenceInfo?: ChecklistEvidenceInfo,
  ) => {
    if (v == null || v === "") return <span className="text-neutral-400 italic">—</span>;
    // Card visual para fotos legadas (sem `checklist_evidences`). Mantém a
    // mesma diagramação do card de curadoria — miniatura, "Ampliar" e um selo
    // explicando por que a curadoria de IA não está disponível — para que a
    // aba "Envios" mostre um bloco visualmente consistente em toda pergunta
    // com foto, e não apenas quando existe evidência rastreável.
    const renderLegacyPhotoCard = (
      thumbUrl: string,
      lightboxUrls: string[],
      lightboxLabels: string[],
      lightboxIndex: number,
    ) => (
      <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
        <button
          type="button"
          onClick={() => openLightbox(lightboxUrls, lightboxIndex, lightboxLabels)}
          className="w-24 h-24 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 flex-shrink-0"
          title="Ampliar"
        >
          <img src={thumbUrl} alt="Foto" className="w-full h-full object-cover" />
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-neutral-50 text-neutral-500 border-neutral-200">
              Arquivo em imagem
            </span>
          </div>
          <p className="text-[11px] text-neutral-500">
            Curadoria para IA disponível apenas em envios feitos com o bloco Câmera atualizado.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openLightbox(lightboxUrls, lightboxIndex, lightboxLabels)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Ampliar
            </button>
          </div>
        </div>
      </div>
    );
    // Card reutilizável de curadoria para IA (thumb + selo + auditoria + ações).
    const renderCurationCard = (
      info: ChecklistEvidenceInfo,
      thumbUrl: string | undefined,
      lightboxUrls: string[],
      lightboxLabels: string[],
      lightboxIndex: number,
    ) => {
      const curated = curatedByEvidence[info.id];
      const dataset = curated ? datasets.find((d) => d.id === curated.dataset_id) : undefined;
      const isLegacy = info.source === "legacy_migrated" || info.source === "legacy_unmapped";
      const isUnmapped = info.source === "legacy_unmapped";
      return (
        <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
          {thumbUrl ? (
            <button
              type="button"
              onClick={() => openLightbox(lightboxUrls, lightboxIndex, lightboxLabels)}
              className="w-24 h-24 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 flex-shrink-0"
              title="Ampliar"
            >
              <img src={thumbUrl} alt="Foto" className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-24 h-24 rounded-lg border border-neutral-200 bg-neutral-100 flex items-center justify-center flex-shrink-0">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {isLegacy && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-neutral-50 text-neutral-500 border-neutral-200">
                  Arquivo em imagem
                </span>
              )}
              {isUnmapped && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-amber-50 text-amber-700 border-amber-200">
                  Origem não identificada
                </span>
              )}
              {curated ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${CLASSIFICATION_TONE[curated.classification]}`}
                >
                  {CLASSIFICATION_LABEL[curated.classification]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-neutral-50 text-neutral-500 border-neutral-200">
                  Não revisada
                </span>
              )}
              {dataset && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-neutral-50 text-neutral-600 border-neutral-200">
                  {dataset.name}
                </span>
              )}
            </div>
            {curated && (
              <p className="text-[11px] text-neutral-500">
                Revisado por {curated.reviewed_by ? (reviewerNames[curated.reviewed_by] ?? curated.reviewed_by.slice(0, 8)) : "—"} em{" "}
                {new Date(curated.reviewed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {thumbUrl && (
                <button
                  type="button"
                  onClick={() => openLightbox(lightboxUrls, lightboxIndex, lightboxLabels)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Ampliar
                </button>
              )}
              {isUnmapped ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-neutral-50 text-neutral-400 border border-neutral-200 cursor-not-allowed"
                  title="Vincule esta imagem manualmente a um padrão visual antes de usá-la para treinamento."
                >
                  <Brain className="w-3.5 h-3.5" />
                  Treinamento indisponível
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => openTrainingModal(info)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#FF007F]/10 text-[#FF007F] hover:bg-[#FF007F]/15 transition-colors"
                >
                  <Brain className="w-3.5 h-3.5" />
                  {curated ? "Alterar classificação" : "Usar para treinar a IA"}
                </button>
              )}
              {curated && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await undoClassification(curated);
                      setCuratedByEvidence((m) => {
                        const next = { ...m };
                        delete next[info.id];
                        return next;
                      });
                      toast.success("Classificação desfeita.");
                    } catch (err: any) {
                      toast.error(err?.message || "Falha ao desfazer.");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Desfazer
                </button>
              )}
            </div>
          </div>
        </div>
      );
    };
    // Bloco Câmera: answer = { evidenceId, analysisEnabled, analysis? }
    if (
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof v.evidenceId === "string" &&
      typeof v.url !== "string"
    ) {
      const info = checklistEvidences[v.evidenceId] ?? evidenceInfo;
      if (!info) {
        return <p className="text-[11px] text-neutral-400 italic">Evidência não localizada.</p>;
      }
      const url = evidenceUrls[info.id];
      if (!url) void ensureEvidenceUrl(info);
      const urls = contextImages?.urls?.length ? contextImages.urls : url ? [url] : [];
      const labels = contextImages?.labels?.length ? contextImages.labels : [blockLabel || ""];
      const idx = url ? Math.max(0, urls.indexOf(url)) : 0;
      return renderCurationCard(info, url, urls, labels, idx);
    }
    if (Array.isArray(v)) {
      if (v[0]?.url) {
        const fieldImageUrls = v
          .filter((f: any) => (f.type || "").startsWith("image/"))
          .map((f: any) => f.url);
        const imageUrls = contextImages?.urls ?? fieldImageUrls;
        const imageLabels =
          contextImages?.labels ?? fieldImageUrls.map(() => blockLabel || "");

        // Se este bloco tem uma evidência associada, ancora a curadoria à primeira imagem.
        const firstImgUrl = fieldImageUrls[0];
        const firstImgIdx = firstImgUrl ? Math.max(0, imageUrls.indexOf(firstImgUrl)) : 0;
        return (
          <div className="space-y-3">
            {firstImgUrl && (
              evidenceInfo
                ? renderCurationCard(evidenceInfo, firstImgUrl, imageUrls, imageLabels, firstImgIdx)
                : renderLegacyPhotoCard(firstImgUrl, imageUrls, imageLabels, firstImgIdx)
            )}
            <div className="flex flex-wrap gap-3">
            {v.map((f: any, i: number) => {
              const isImg = (f.type || "").startsWith("image/");
              // Imagens já aparecem no card acima; não repete "Visualizar imagem" por foto.
              if (isImg) return null;
              return (
                <a 
                  key={i} 
                  href={f.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-xs text-[#FF007F] hover:bg-neutral-50 transition-colors shadow-sm font-medium"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-[120px] truncate">Visualizar arquivo</span>
                </a>
              );
            })}
            </div>
          </div>
        );
      }
      return <span>{v.join(", ")}</span>;
    }
    if (typeof v === "object" && v.url) {
      const isImg = (v.type || "").startsWith("image/");
      if (isImg) {
        const urls = contextImages?.urls ?? [v.url];
        const labels = contextImages?.labels ?? [blockLabel || ""];
        const idx = urls.indexOf(v.url);
        if (evidenceInfo) {
          return renderCurationCard(evidenceInfo, v.url, urls, labels, idx >= 0 ? idx : 0);
        }
        return renderLegacyPhotoCard(v.url, urls, labels, idx >= 0 ? idx : 0);
      }
      return (
        <a 
          href={v.url} 
          target="_blank" 
          rel="noreferrer" 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-xs text-[#FF007F] hover:bg-neutral-50 transition-colors shadow-sm font-medium"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Visualizar arquivo</span>
        </a>
      );
    }
    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 whitespace-pre-wrap break-words">
        {String(v)}
      </div>
    );
  };

  const showResponses = filter === "todos" || filter === "completo";
  const showPartials = filter === "todos" || filter === "parcial";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Envios</h3>
            <p className="text-sm text-neutral-500">Acompanhe as respostas recebidas. A retenção automática afeta apenas os envios, não o checklist.</p>
          </div>
          <button
            onClick={() => fetchSubmissions(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-all active:scale-95 disabled:opacity-50"
            title="Sincronizar dados"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Sincronizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-neutral-100 rounded-lg">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${
                filter === t.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {t.label}
              {t.id === "parcial" && planType !== "pro" && (
                <Lock className="w-3 h-3 text-neutral-400" />
              )}
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${filter === t.id ? "bg-[#FF007F] text-white" : "bg-neutral-200 text-neutral-600"}`}>
                {counts[t.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium" title="Apaga apenas as respostas, preservando o checklist">Retenção de envios</span>
            <Switch checked={isRetentionEnabled} onCheckedChange={toggleRetention} />
          </div>

          {isRetentionEnabled && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500 font-medium">Armazenar por</span>
              <select
                value={retention}
                onChange={(e) => updateRetention(Number(e.target.value))}
                className="px-2 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 font-bold outline-none focus:border-[#FF007F]"
              >
                {[3, 4, 5, 6, 7, 15, 30].map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF007F]"></div>
        </div>
      ) : filter === "parcial" && planType !== "pro" ? (
        <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center flex flex-col items-center">
          <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mb-4 text-[#FF007F]">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 mb-2">Envios Parciais</h3>
          <p className="text-sm text-neutral-500 max-w-sm mb-6">
            Capture respostas incompletas antes que sejam enviadas. Disponível apenas para assinantes Pro.
          </p>
          <button
            onClick={() => window.location.href = '/membros'}
            className="px-6 py-2 bg-[#FF007F] text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
          >
            Conhecer o Pro
          </button>
        </div>
      ) : filter === "comparar" ? (
        <CompareTab responses={responses} blocks={blocks} />
      ) : counts[filter] === 0 ? (
        <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center">
          <Inbox className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Nenhum envio encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {showResponses && responses.map((r) => {
            const isOpen = expanded === r.id;
            const responder = identifyResponder(r.answers) ?? `Visitante ${r.visitor_id.slice(0, 6)}`;
            const photoStats = summarizePhotos(r.answers);
            const badge = photoBadge(photoStats);
            return (
              <div key={r.id} className="border border-neutral-100 rounded-2xl overflow-hidden bg-white">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50/50 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
                  <span className="inline-flex items-center gap-1.5 text-green-600 font-medium text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Completo
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-neutral-900 font-semibold text-sm truncate max-w-[220px]">{responder}</span>
                    <span className="text-neutral-400 text-[11px]">{formatDate(r.created_at)}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${badge.tone}`}>
                    <Images className="w-3 h-3" />
                    {badge.label}
                  </span>
                  {photoStats.total > 0 && (
                    <span className="text-[11px] text-neutral-500">
                      {photoStats.total} foto{photoStats.total > 1 ? "s" : ""}
                      {photoStats.evidenceCount > 0 && ` · ${photoStats.pending} pendente${photoStats.pending === 1 ? "" : "s"}`}
                    </span>
                  )}
                  <span className="text-neutral-400 text-[10px] ml-auto">Expira {formatDate(r.expires_at)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteResponse(r.id); }}
                    className="text-neutral-400 hover:text-[#FF007F] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
                {isOpen && (
                  <div className="border-t border-neutral-100 px-4 py-4 bg-neutral-50/40 space-y-4">
                    {Object.keys(r.answers || {}).length === 0 ? (
                      <p className="text-sm text-neutral-400 italic">Sem respostas registradas.</p>
                    ) : (
                      <>
                        {(() => {
                          const { urls: allImages, labels: allLabels } = collectImagesFromAnswers(r.answers);
                          if (allImages.length < 2) return null;
                          return (
                            <div className="flex justify-end">
                              <button
                                onClick={() => openLightbox(allImages, 0, allLabels)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF007F] text-white text-xs font-bold hover:opacity-90 transition-opacity shadow-sm"
                              >
                                <Images className="w-3.5 h-3.5" />
                                Ver todas as imagens ({allImages.length})
                              </button>
                            </div>
                          );
                        })()}
                        {(() => {
                          const ctx = collectImagesFromAnswers(r.answers);
                          return Object.entries(r.answers).map(([blockId, value]) => (
                        <div key={blockId} className="space-y-1">
                          <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide">
                            {labelForBlock(blockId)}
                          </p>
                          <div className="text-sm text-neutral-800">
                            {renderAnswerValue(
                              value,
                              labelForBlock(blockId),
                              ctx,
                              evidenceByRespBlock[`${r.id}::${blockId}`],
                            )}
                          </div>
                        </div>
                          ));
                        })()}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {showPartials && partials.map((r) => {
            const isOpen = expanded === r.id;
            const partialAnswers = r.metadata?.partial_answers || {};
            const hasAnswers = Object.keys(partialAnswers).length > 0;
            const responder = identifyResponder(partialAnswers) ?? `Visitante ${r.visitor_id.slice(0, 6)}`;
            const photoStats = summarizePhotos(partialAnswers);
            const badge = photoBadge(photoStats);

            return (
              <div key={r.id} className="border border-neutral-100 rounded-2xl overflow-hidden bg-white">
                <button
                  onClick={() => hasAnswers && setExpanded(isOpen ? null : r.id)}
                  className={`w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors ${hasAnswers ? "hover:bg-neutral-50/50" : "cursor-default"}`}
                >
                  {hasAnswers ? (
                    isOpen ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />
                  ) : <div className="w-4" />}
                  <span className="inline-flex items-center gap-1.5 text-orange-500 font-medium text-sm">
                    <Clock className="w-4 h-4" /> Parcial
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-neutral-900 font-semibold text-sm truncate max-w-[220px]">{responder}</span>
                    <span className="text-neutral-400 text-[11px]">Iniciado {formatDate(r.started_at)}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${badge.tone}`}>
                    <Images className="w-3 h-3" />
                    {badge.label}
                  </span>
                  {photoStats.total > 0 && (
                    <span className="text-[11px] text-neutral-500 ml-auto">
                      {photoStats.total} foto{photoStats.total > 1 ? "s" : ""}
                      {photoStats.evidenceCount > 0 && ` · ${photoStats.pending} pendente${photoStats.pending === 1 ? "" : "s"}`}
                    </span>
                  )}
                </button>
                {isOpen && hasAnswers && (
                  <div className="border-t border-neutral-100 px-4 py-4 bg-neutral-50/40 space-y-4">
                    {(() => {
                      const { urls: allImages, labels: allLabels } = collectImagesFromAnswers(partialAnswers);
                      if (allImages.length < 2) return null;
                      return (
                        <div className="flex justify-end">
                          <button
                            onClick={() => openLightbox(allImages, 0, allLabels)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF007F] text-white text-xs font-bold hover:opacity-90 transition-opacity shadow-sm"
                          >
                            <Images className="w-3.5 h-3.5" />
                            Ver todas as imagens ({allImages.length})
                          </button>
                        </div>
                      );
                    })()}
                    {(() => {
                      const ctx = collectImagesFromAnswers(partialAnswers);
                      return Object.entries(partialAnswers).map(([blockId, value]) => (
                      <div key={blockId} className="space-y-1">
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide">
                          {labelForBlock(blockId)}
                        </p>
                        <div className="text-sm text-neutral-800">
                          {renderAnswerValue(
                            value,
                            labelForBlock(blockId),
                            ctx,
                            evidenceByRespBlock[`${r.id}::${blockId}`],
                          )}
                        </div>
                      </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog 
        open={lightbox.isOpen} 
        onOpenChange={(open) => setLightbox(prev => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="max-w-none w-screen h-screen sm:w-[95vw] sm:h-[95vh] p-0 border-none bg-black/90 flex flex-col items-center justify-center overflow-hidden">
          <VisuallyHidden>
            <DialogTitle>Visualização de Imagem</DialogTitle>
          </VisuallyHidden>
          
          <button 
            onClick={() => setLightbox(prev => ({ ...prev, isOpen: false }))}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {lightbox.images.length > 1 && (
            <>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(prev => ({
                    ...prev,
                    currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length
                  }));
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(prev => ({
                    ...prev,
                    currentIndex: (prev.currentIndex + 1) % prev.images.length
                  }));
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
              
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-white/10 text-white text-sm font-medium backdrop-blur-md">
                {lightbox.currentIndex + 1} / {lightbox.images.length}
              </div>
            </>
          )}

          {lightbox.labels[lightbox.currentIndex] && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-[80vw] px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium backdrop-blur-md truncate">
              {lightbox.labels[lightbox.currentIndex]}
            </div>
          )}

          <div className="w-full h-full flex items-center justify-center p-4 sm:p-8">
            <img 
              key={lightbox.currentIndex}
              src={lightbox.images[lightbox.currentIndex]} 
              alt={`Imagem ${lightbox.currentIndex + 1}`}
              decoding="async"
              loading="eager"
              onLoad={(e) => {
                const img = e.currentTarget;
                setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
            {/* Hidden preloader for adjacent images */}
            {lightbox.images.length > 1 && (
              <div className="hidden">
                {lightbox.images.map((url, i) => (
                  <img key={i} src={url} alt="" />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!trainingModal} onOpenChange={(o) => { if (!o) closeTrainingModal(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Usar imagem para treinar a IA</DialogTitle>
            <DialogDescription>
              A imagem original permanece intacta em Envios. A cópia aprovada entra no dataset do padrão visual selecionado.
              O treinamento não é iniciado automaticamente.
            </DialogDescription>
          </DialogHeader>
          {trainingModal && (
            <div className="space-y-4">
              {trainingModal.previewUrl && (
                <img
                  src={trainingModal.previewUrl}
                  alt="Foto enviada"
                  className="w-full max-h-64 object-contain rounded-lg border border-neutral-200 bg-neutral-50"
                />
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700">Padrão visual</label>
                <select
                  className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
                  value={modalDatasetId}
                  onChange={(e) => setModalDatasetId(e.target.value)}
                  disabled={modalBusy}
                >
                  <option value="">Selecione um padrão visual…</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700">Classificação</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["normal", "anomalous", "ignored"] as Classification[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={modalBusy}
                      onClick={() => setModalClassification(c)}
                      className={`px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                        modalClassification === c
                          ? `${CLASSIFICATION_TONE[c]} ring-2 ring-offset-1 ring-[#FF007F]/40`
                          : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      {CLASSIFICATION_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700">Observação (opcional)</label>
                <Textarea
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder="Contexto útil para curadoria futura…"
                  className="min-h-[64px] text-sm"
                  disabled={modalBusy}
                />
              </div>
              {curatedByEvidence[trainingModal.evidence.id] && (
                <p className="text-[11px] text-neutral-500">
                  Esta imagem já foi aprovada por{" "}
                  {(() => {
                    const c = curatedByEvidence[trainingModal.evidence.id];
                    return c.reviewed_by ? (reviewerNames[c.reviewed_by] ?? c.reviewed_by.slice(0, 8)) : "—";
                  })()}
                  {" "}em{" "}
                  {new Date(curatedByEvidence[trainingModal.evidence.id].reviewed_at).toLocaleString("pt-BR")}. Salvar sobrescreve a classificação anterior.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {trainingModal && curatedByEvidence[trainingModal.evidence.id] && (
              <Button variant="outline" onClick={undoTraining} disabled={modalBusy} className="mr-auto">
                <Undo2 className="w-4 h-4 mr-1.5" /> Desfazer aprovação
              </Button>
            )}
            <Button variant="outline" onClick={closeTrainingModal} disabled={modalBusy}>
              Cancelar
            </Button>
            <Button
              onClick={submitTraining}
              disabled={modalBusy || !modalDatasetId}
              className="bg-[#FF007F] hover:bg-[#e6006f] text-white"
            >
              {modalBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Brain className="w-4 h-4 mr-1.5" />}
              Aprovar para treinamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
