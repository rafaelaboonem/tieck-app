import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, Inbox, ChevronDown, ChevronRight, FileText, Trash2, ChevronLeft, X, Lock, Sparkles, RefreshCcw, Images, Brain, Undo2, Loader2, Info, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CompareTab } from "./CompareTab";
import { getEvidenceSignedUrl } from "@/lib/evidence-signed-url";


type ResponseRow = {
  id: string;
  visitor_id: string;
  created_at: string;
  expires_at: string;
  answers: Record<string, any>;
  camera_attempts?: CameraAIAttempt[];
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

type CameraAIAttempt = {
  id: string;
  response_id: string;
  decision: 'approved' | 'rejected' | 'not_observable' | 'error';
  evidence: string;
  model: string;
  duration_ms: number;
  completed_at: string;
  code: string;
  evidence_id: string;
};

type EvidenceData = {
  id: string;
  storage_path: string;
  bucket_name?: string;
  status?: string;
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

      // Hydrate with Camera AI attempts
      const respIds = (resp.data ?? []).map((r: any) => r.id);
      const { data: cameraAttempts } = respIds.length > 0 
        ? await supabase.from("camera_ai_attempts").select("*").in("response_id", respIds)
        : { data: [] };
      
      const hydratedResponses = (resp.data ?? []).map((r: any) => ({
        ...r,
        camera_attempts: (cameraAttempts ?? []).filter((a: any) => a.response_id === r.id)
      }));

      setResponses(hydratedResponses as ResponseRow[]);
      const partialRows = ((ana.data ?? []) as PartialRow[]).filter(
        (p) => p.metadata && Object.keys(p.metadata?.partial_answers || {}).length > 0
      );
      setPartials(partialRows);
      
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
    fetchSubmissions();
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
    fetchSubmissions();
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

  const summarizePhotos = (answers: Record<string, any>, attempts: CameraAIAttempt[] = []) => {
    let total = 0, aiApproved = 0, photoReceived = 0, inconsistencies = 0, rejected = 0;
    
    for (const v of Object.values(answers || {})) {
      if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).evidenceId === "string") {
        total += 1;
        const attempt = attempts.find(a => a.evidence_id === (v as any).evidenceId);
        if (attempt) {
          if (attempt.decision === 'approved') aiApproved += 1;
          else if (attempt.decision === 'rejected') rejected += 1;
          else inconsistencies += 1;
        } else {
          photoReceived += 1;
        }
        continue;
      }
      if (Array.isArray(v)) {
        for (const f of v) if (f?.url && (f.type || "").startsWith("image/")) {
           total += 1;
           photoReceived += 1;
        }
      } else if (v && typeof v === "object" && (v as any).url && ((v as any).type || "").startsWith("image/")) {
        total += 1;
        photoReceived += 1;
      }
    }
    return { total, aiApproved, photoReceived, inconsistencies, rejected };
  };

  const photoBadge = (s: { total: number; aiApproved: number; photoReceived: number; inconsistencies: number; rejected: number }) => {
    if (s.total === 0) return { label: "Sem evidências", tone: "bg-neutral-100 text-neutral-500 border-neutral-200" };
    const totalLabel = `${s.total} evidência${s.total > 1 ? "s" : ""}`;
    
    if (s.aiApproved > 0) return { label: totalLabel, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (s.rejected > 0) return { label: totalLabel, tone: "bg-red-50 text-red-700 border-red-200" };
    return { label: totalLabel, tone: "bg-neutral-50 text-neutral-600 border-neutral-200" };
  };


  const openLightbox = (images: string[], index: number, labels?: string[]) => {
    setLightbox({
      isOpen: true,
      images,
      labels: labels && labels.length === images.length ? labels : images.map(() => ""),
      currentIndex: index,
    });
  };

  const renderAnswerValue = (v: any, blockLabel?: string, attempts: CameraAIAttempt[] = []) => {
    if (v == null || v === "") return <span className="text-neutral-400 italic">—</span>;

    // New AI Verification Card
    if (typeof v === "object" && !Array.isArray(v) && typeof v.evidenceId === "string") {
      return <EvidenceCard evidenceId={v.evidenceId} blockLabel={blockLabel} attempts={attempts} openLightbox={openLightbox} />;
    }

    // Legacy or Standard File Array
    if (Array.isArray(v)) {
      const images = v.filter((f: any) => (f.type || "").startsWith("image/"));
      if (images.length > 0) {
        return (
          <div className="flex flex-wrap gap-3">
            {images.map((f: any, i: number) => (
              <div key={i} className="flex flex-col gap-2 p-2 rounded-xl border border-neutral-200 bg-white">
                <button
                  onClick={() => openLightbox(images.map(img => img.url), i, images.map(() => blockLabel || ""))}
                  className="w-20 h-20 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100"
                >
                  <img src={f.url} alt="Preview" className="w-full h-full object-cover" />
                </button>
              </div>
            ))}
          </div>
        );
      }
      return <span className="text-sm text-neutral-800">{v.join(", ")}</span>;
    }

    if (typeof v === "object" && v.url) {
      if ((v.type || "").startsWith("image/")) {
        return (
          <div className="flex flex-col gap-2 p-2 w-fit rounded-xl border border-neutral-200 bg-white">
            <button
              onClick={() => openLightbox([v.url], 0, [blockLabel || ""])}
              className="w-20 h-20 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100"
            >
              <img src={v.url} alt="Preview" className="w-full h-full object-cover" />
            </button>
          </div>
        );
      }
      return (
        <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-[#FF007F] font-medium hover:underline">
          <FileText className="w-3.5 h-3.5" /> Visualizar arquivo
        </a>
      );
    }

    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 whitespace-pre-wrap break-words shadow-sm">
        {String(v)}
      </div>
    );
  };


  const showResponses = filter === "todos" || filter === "completo";
  const showPartials = filter === "todos" || filter === "parcial";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-neutral-900 mb-1">Envios</h3>
          <p className="text-sm text-neutral-500">Resultados e verificação da Camera AI.</p>
        </div>
        <button
          onClick={() => fetchSubmissions(true)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Sincronizar
        </button>
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
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${filter === t.id ? "bg-[#FF007F] text-white" : "bg-neutral-200 text-neutral-600"}`}>
                {counts[t.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium">Retenção de envios</span>
            <Switch checked={isRetentionEnabled} onCheckedChange={toggleRetention} />
          </div>
          {isRetentionEnabled && (
            <select
              value={retention}
              onChange={(e) => updateRetention(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold outline-none focus:border-[#FF007F]"
            >
              {[3, 7, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF007F]" />
        </div>
      ) : counts[filter] === 0 ? (
        <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center">
          <Inbox className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Nenhum envio encontrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {showResponses && responses.map((r) => {
            const isOpen = expanded === r.id;
            const responder = identifyResponder(r.answers) ?? `Visitante ${r.visitor_id.slice(0, 6)}`;
            const stats = summarizePhotos(r.answers, r.camera_attempts);
            const badge = photoBadge(stats);
            
            return (
              <div key={r.id} className="border border-neutral-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:border-neutral-200">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full flex flex-wrap items-center gap-3 px-4 py-4 text-left hover:bg-neutral-50/50 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" /> Completo
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-neutral-900 font-bold text-sm truncate max-w-[220px]">{responder}</span>
                    <span className="text-neutral-400 text-[10px] font-medium">{formatDate(r.created_at)}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badge.tone}`}>
                    <Images className="w-3.5 h-3.5" />
                    {badge.label}
                  </span>
                  <span className="text-neutral-400 text-[10px] ml-auto font-medium">Expira {formatDate(r.expires_at)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteResponse(r.id); }}
                    className="p-2 text-neutral-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
                
                {isOpen && (
                  <div className="border-t border-neutral-100 px-6 py-6 bg-neutral-50/30 space-y-6 animate-in slide-in-from-top-2 duration-200">
                    {Object.entries(r.answers).map(([blockId, value]) => (
                      <div key={blockId} className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">
                          {labelForBlock(blockId)}
                        </label>
                        {renderAnswerValue(value, labelForBlock(blockId), r.camera_attempts)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={lightbox.isOpen} onOpenChange={(open) => setLightbox(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-none w-screen h-screen sm:w-[95vw] sm:h-[95vh] p-0 border-none bg-black/95 flex flex-col items-center justify-center overflow-hidden">
          <VisuallyHidden><DialogTitle>Visualização</DialogTitle></VisuallyHidden>
          <button onClick={() => setLightbox(prev => ({ ...prev, isOpen: false }))} className="absolute top-6 right-6 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="w-full h-full flex items-center justify-center p-8">
            <img src={lightbox.images[lightbox.currentIndex]} alt="Fullscreen" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EvidenceCard({ 
  evidenceId, 
  blockLabel, 
  attempts, 
  openLightbox 
}: { 
  evidenceId: string; 
  blockLabel?: string; 
  attempts: CameraAIAttempt[]; 
  openLightbox: (images: string[], index: number, labels?: string[]) => void;
}) {
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const attempt = useMemo(() => attempts.find(a => a.evidence_id === evidenceId), [attempts, evidenceId]);
  
  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('checklist_evidences')
          .select('id, storage_path')
          .eq('id', evidenceId)
          .maybeSingle();


        
        if (error) throw error;
        if (data) {
          setEvidence(data);
          const url = await getEvidenceSignedUrl(data.storage_path);
          setSignedUrl(url);
        }
      } catch (err) {
        console.error('Failed to load evidence details:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [evidenceId]);

  const isApproved = attempt?.decision === 'approved';
  const isRejected = attempt?.decision === 'rejected';
  const isTechnicalFailure = attempt?.decision === 'error' || attempt?.code?.includes('failure') || attempt?.code?.includes('error');

  const statusBadge = useMemo(() => {
    if (!attempt) return { label: "Sem verificação automática", tone: "neutral" };
    if (isApproved) return { label: "Aprovada pela IA", tone: "approved" };
    if (isRejected) return { label: "Rejeitada pela IA", tone: "rejected" };
    if (isTechnicalFailure) return { label: "Verificação indisponível", tone: "neutral" };
    return { label: "Verificação não localizada", tone: "neutral" };
  }, [attempt, isApproved, isRejected, isTechnicalFailure]);

  const reviewStatus = useMemo(() => {
    if (!evidence?.status) return "Não revisada";
    if (evidence.status === 'confirmed') return "Confirmada";
    if (evidence.status === 'flagged') return "Marcada para revisão";
    return "Não revisada";
  }, [evidence?.status]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50/50 animate-pulse">
        <div className="w-24 h-24 rounded-lg bg-neutral-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-neutral-200 rounded" />
          <div className="h-3 w-full bg-neutral-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300 transition-colors">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => signedUrl && openLightbox([signedUrl], 0, [blockLabel || ""])}
          className="w-28 h-28 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50 flex-shrink-0 relative group"
        >
          {signedUrl ? (
            <>
              <img src={signedUrl} alt="Foto" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 gap-2">
              <Images className="w-6 h-6" />
              <span className="text-[10px] font-medium">Imagem indisponível</span>
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider ${
              statusBadge.tone === 'approved' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
              statusBadge.tone === 'rejected' ? "bg-red-50 text-red-700 border-red-100" :
              "bg-neutral-50 text-neutral-500 border-neutral-100"
            }`}>
              {statusBadge.label}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border-blue-100">
              {reviewStatus}
            </span>
          </div>

          {attempt?.evidence && (
            <p className="text-[11px] text-neutral-600 leading-relaxed line-clamp-3 bg-neutral-50/50 p-2 rounded-lg border border-neutral-100">
              {attempt.evidence}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!signedUrl}
              onClick={() => signedUrl && openLightbox([signedUrl], 0, [blockLabel || ""])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-all active:scale-95 disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Ampliar
            </button>
          </div>
        </div>
      </div>
      
      {attempt && (
        <details className="group border-t border-neutral-100 pt-2">
          <summary className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600 transition-colors list-none">
            <Info className="w-3 h-3 transition-transform group-open:rotate-180" />
            Detalhes técnicos
          </summary>
          <div className="mt-2 space-y-1.5 text-[10px] text-neutral-500 bg-neutral-50/50 rounded-lg p-2.5 border border-neutral-100">
            <div className="flex justify-between border-b border-neutral-100/50 pb-1">
              <span className="font-semibold uppercase tracking-tight">Modelo</span>
              <span>{attempt.model}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100/50 pb-1">
              <span className="font-semibold uppercase tracking-tight">Duração</span>
              <span>{attempt.duration_ms}ms</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100/50 pb-1">
              <span className="font-semibold uppercase tracking-tight">Código</span>
              <span className="font-mono">{attempt.code || "—"}</span>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

