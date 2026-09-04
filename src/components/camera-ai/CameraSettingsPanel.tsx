import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, Play, Upload, X, Camera } from "lucide-react";
import { CameraVerificationPolicyV1, PublishedBlock, CameraBlockPatch, CameraReferenceImageV1 } from "@/lib/camera-ai/schema.functions";
import { CameraVerificationTestDialog } from "./CameraVerificationTestDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CameraDraft {
  title: string;
  description: string;
  required: boolean;
  mode: string;
  policy: CameraVerificationPolicyV1 | undefined;
  cameraReference: CameraReferenceImageV1 | undefined;
}

interface CameraSettingsPanelProps {
  block: PublishedBlock;
  isOpen: boolean;
  onClose: () => void;
  onSave: (patch: CameraBlockPatch) => void;
  isCompiling: boolean;
  checklistId: string;
}


export function CameraSettingsPanel({ block, isOpen, onClose, onSave, isCompiling, checklistId }: CameraSettingsPanelProps) {
  const [draft, setDraft] = useState<CameraDraft>({
    title: block.title || block.subtitle || "",
    description: block.description || "",
    required: block.required !== false,
    mode: block.mode || 'auto',
    policy: block.cameraAiPolicy as CameraVerificationPolicyV1 | undefined,
    cameraReference: block.cameraReference
  });

  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft({
        title: block.title || block.subtitle || "",
        description: block.description || "",
        required: block.required !== false,
        mode: block.mode || 'auto',
        policy: block.cameraAiPolicy as CameraVerificationPolicyV1 | undefined,
        cameraReference: block.cameraReference
      });
      setHasChanges(false);
    }
  }, [isOpen, block]);

  const handleFieldChange = <K extends keyof CameraDraft>(
    field: K,
    value: CameraDraft[K]
  ) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setHasChanges(true);
  };


  const handlePolicyChange = (patch: Partial<CameraVerificationPolicyV1>) => {
    if (!draft.policy) return;
    setDraft(prev => ({
      ...prev,
      policy: { ...prev.policy!, ...patch, source: 'owner_edited' } as CameraVerificationPolicyV1
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave({
      title: draft.title,
      subtitle: draft.title,
      description: draft.description,
      required: draft.required,
      mode: draft.mode,
      cameraAiPolicy: draft.policy,
      cameraReference: draft.cameraReference || null
    });
    setHasChanges(false);
  };

  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreview() {
      if (draft.cameraReference && draft.mode === 'reference' && isOpen) {
        try {
          const { data: session } = await supabase.auth.getSession();
          if (!session.session?.access_token) return;

          const res = await fetch(`/api/camera-ai/reference-image/preview?checklistId=${checklistId}&blockId=${block.id}&storagePath=${encodeURIComponent(draft.cameraReference.storagePath)}`, {
            headers: {
              'Authorization': `Bearer ${session.session.access_token}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            setPreviewUrl(data.signedUrl);
          }
        } catch (e) {
          console.error("Preview error:", e);
        }
      } else {
        setPreviewUrl(null);
      }
    }
    loadPreview();
  }, [draft.cameraReference, draft.mode, checklistId, isOpen]);

  const handleUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Não autenticado");

      const formData = new FormData();
      formData.append('checklistId', checklistId);
      formData.append('blockId', block.id);
      formData.append('reference', file);

      const res = await fetch('/api/camera-ai/reference-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`
        },
        body: formData
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Falha no upload");
      }

      const metadata = await res.json();
      handleFieldChange('cameraReference', metadata);
      toast.success("Foto de referência adicionada!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao fazer upload da referência");
    } finally {
      setIsUploading(false);
      // Clear input
      e.target.value = '';
    }
  };

  const requestClose = () => {
    if (hasChanges) {
      if (!confirm("Descartar alterações não salvas?")) return;
    }
    onClose();
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => {
        if (!open) requestClose();
      }}>
        <SheetContent className="w-full sm:max-w-[460px] overflow-y-auto">
          <SheetHeader className="pb-6 border-b">
            <SheetTitle className="text-xl font-bold">Configuração da câmera</SheetTitle>
            <SheetDescription>Configure como a IA deve verificar esta pergunta.</SheetDescription>
          </SheetHeader>

          <div className="py-6 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-900">Pergunta</label>
                <input
                  type="text"
                  value={draft.title}
                  placeholder="Ex.: Foto da bancada limpa"
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-900">Instrução complementar <span className="text-neutral-400 font-normal">(opcional)</span></label>
                <textarea
                  value={draft.description}
                  placeholder="Ex.: Certifique-se de que a logo esteja visível."
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none min-h-[80px] resize-none"
                />
              </div>


              <div className="space-y-3">
                <label className="text-sm font-bold text-neutral-900">Modo de verificação</label>
                <div className="grid grid-cols-1 gap-3">
                  <div 
                    onClick={() => {
                      handleFieldChange('mode', 'auto');
                      handleFieldChange('cameraReference', undefined);
                    }}
                    className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-colors ${draft.mode === 'auto' ? 'border-pink-200 bg-pink-50/30' : 'border-neutral-100 hover:border-neutral-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-4 ${draft.mode === 'auto' ? 'border-pink-500' : 'border-neutral-200'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-neutral-900">Automático</p>
                          <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-100 text-[9px] h-4 px-1 border-none font-bold uppercase tracking-tight">Recomendado</Badge>
                        </div>
                        <p className="text-[11px] text-neutral-500">A IA analisa e aprova em segundos.</p>
                      </div>
                    </div>
                  </div>

                  <div 
                    onClick={() => handleFieldChange('mode', 'reference')}
                    className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-colors ${draft.mode === 'reference' ? 'border-blue-200 bg-blue-50/30' : 'border-neutral-100 hover:border-neutral-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-4 ${draft.mode === 'reference' ? 'border-blue-500' : 'border-neutral-200'}`} />
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Comparar com referência</p>
                        <p className="text-[11px] text-neutral-500">Compare com uma foto padrão esperada.</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-neutral-100 rounded-xl opacity-50 bg-neutral-50">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
                      <p className="text-sm font-bold text-neutral-900">Múltiplas fotos</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Em breve</Badge>
                  </div>
                </div>

                {draft.mode === 'reference' && (
                  <div className="mt-4 p-4 border rounded-xl border-blue-100 bg-blue-50/20 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-blue-900">Foto de referência</label>
                      <p className="text-[11px] text-blue-700/70">Adicione uma foto mostrando como o resultado esperado deve aparecer.</p>
                    </div>

                    {previewUrl ? (
                      <div className="relative group rounded-lg overflow-hidden border border-blue-200 aspect-video bg-white">
                        <img src={previewUrl} alt="Referência" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <label className="cursor-pointer bg-white text-neutral-900 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-neutral-50">
                            <Upload className="w-3 h-3" />
                            Trocar foto
                            <input type="file" className="hidden" accept="image/*" onChange={handleUploadReference} />
                          </label>
                          <button 
                            onClick={() => {
                              handleFieldChange('cameraReference', undefined);
                              setPreviewUrl(null);
                            }}
                            className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-red-600"
                          >
                            <X className="w-3 h-3" />
                            Remover
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isUploading ? 'bg-neutral-50 border-neutral-300 cursor-wait' : 'hover:bg-blue-50 border-blue-200 bg-white'}`}>
                        {isUploading ? (
                          <>
                            <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
                            <p className="text-[11px] text-blue-700 font-medium">Fazendo upload...</p>
                          </>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                              <Camera className="w-5 h-5 text-blue-600" />
                            </div>
                            <p className="text-[11px] text-blue-700 font-bold">Clique para adicionar foto</p>
                            <p className="text-[9px] text-blue-500 uppercase font-bold mt-1 tracking-wider">PNG, JPG até 3MB</p>
                          </>
                        )}
                        <input type="file" className="hidden" accept="image/*" onChange={handleUploadReference} disabled={isUploading} />
                      </label>
                    )}

                    {!draft.cameraReference && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 text-red-700">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <p className="text-[10px] font-bold leading-tight">Adicione uma foto de referência para usar este modo.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-neutral-900">Resumo da verificação</label>
              {isCompiling ? (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <p className="text-xs text-blue-700 font-medium">Preparando verificação...</p>
                </div>
              ) : draft.policy?.summary ? (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
                  <p className="text-xs text-blue-800 leading-relaxed font-medium">{draft.policy.summary}</p>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-neutral-200 text-center"><p className="text-xs text-neutral-400">Salve para gerar o resumo.</p></div>
              )}
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced" className="border-none">
                <AccordionTrigger className="text-sm font-bold py-2 hover:no-underline text-neutral-900">Configuração avançada</AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Evidência necessária</label>
                    <div className="space-y-2">
                      {(draft.policy?.requiredVisibleEvidence || []).map((item: string, idx: number) => (
                        <input
                          key={idx}
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const next = [...(draft.policy?.requiredVisibleEvidence || [])];
                            next[idx] = e.target.value;
                            handlePolicyChange({ requiredVisibleEvidence: next });
                          }}
                          className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-neutral-400 outline-none"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Rejeitar quando</label>
                    <div className="space-y-2">
                      {(draft.policy?.rejectionSignals || []).map((item: string, idx: number) => (
                        <input
                          key={idx}
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const next = [...(draft.policy?.rejectionSignals || [])];
                            next[idx] = e.target.value;
                            handlePolicyChange({ rejectionSignals: next });
                          }}
                          className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-neutral-400 outline-none"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Nível de rigor</label>
                      <div className="w-full px-3 py-2 text-xs border border-neutral-100 bg-neutral-50 rounded-lg text-neutral-600 font-medium cursor-default">
                        Padrão
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Em caso de dúvida</label>
                      <div className="w-full px-3 py-2 text-xs border border-neutral-100 bg-neutral-50 rounded-lg text-neutral-600 font-medium cursor-default">
                        Exigir outra foto
                      </div>
                    </div>
                  </div>

                </AccordionContent>

              </AccordionItem>
            </Accordion>
            <div className="flex items-center justify-between p-4 border rounded-xl bg-neutral-50/50">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-neutral-900">Foto obrigatória</p>
                <p className="text-[11px] text-neutral-500">O formulário só pode ser enviado com a foto.</p>
              </div>
              <Switch
                checked={draft.required}
                onCheckedChange={(checked) => handleFieldChange('required', checked)}
              />
            </div>
          </div>


          <div className="sticky bottom-0 bg-white pt-6 pb-2 border-t flex flex-col gap-3">
            <button onClick={handleSave} disabled={!hasChanges} className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">Salvar bloco</button>
            <button 
              onClick={() => setIsTestModalOpen(true)} 
              disabled={hasChanges || isCompiling}
              className="w-full py-3 bg-white text-neutral-700 border rounded-xl font-bold text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <Play className="w-3.5 h-3.5 fill-current" /> Testar verificação
              </div>
              {(hasChanges || isCompiling) && (
                <span className="text-[10px] text-neutral-400 font-normal italic">Salve as alterações antes de testar</span>
              )}
            </button>

          </div>
        </SheetContent>
      </Sheet>

      <CameraVerificationTestDialog
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        blockId={block.id}
        checklistId={checklistId}
      />
    </>
  );
}
