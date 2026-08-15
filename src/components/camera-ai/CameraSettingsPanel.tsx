import { useState, useEffect } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from "@/components/ui/sheet";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info, X, Loader2, Play } from "lucide-react";
import { CameraVerificationPolicyV1 } from "@/server/camera-ai/schema";
import { CameraVerificationTestDialog } from "./CameraVerificationTestDialog";

interface CameraSettingsPanelProps {
  block: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (patch: any) => void;
  isCompiling: boolean;
  checklistId: string;
}

export function CameraSettingsPanel({
  block,
  isOpen,
  onClose,
  onSave,
  isCompiling,
  checklistId
}: CameraSettingsPanelProps) {
  const [draft, setDraft] = useState({
    title: block.title || block.subtitle || "",
    description: block.description || "",
    required: block.required !== false,
    mode: block.mode || 'auto',
    policy: block.cameraAiPolicy as CameraVerificationPolicyV1 | undefined
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
        policy: block.cameraAiPolicy as CameraVerificationPolicyV1 | undefined
      });
      setHasChanges(false);
    }
  }, [isOpen, block]);

  const handleFieldChange = (field: string, value: any) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handlePolicyChange = (patch: Partial<CameraVerificationPolicyV1>) => {
    if (!draft.policy) return;
    setDraft(prev => ({
      ...prev,
      policy: { ...prev.policy!, ...patch, source: 'owner_edited' }
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
      cameraAiPolicy: draft.policy
    });
    setHasChanges(false);
  };

  const policy = draft.policy;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => {
        if (!open) {
          if (hasChanges && !confirm("Descartar alterações não salvas?")) return;
          onClose();
        }
      }}>
        <SheetContent className="w-full sm:max-w-[460px] overflow-y-auto">
          <SheetHeader className="pb-6 border-b">
            <SheetTitle className="text-xl font-bold">Configuração da câmera</SheetTitle>
            <SheetDescription>
              Configure como a IA deve verificar esta pergunta.
            </SheetDescription>
          </SheetHeader>

          <div className="py-6 space-y-8">
            {/* Campos Principais */}
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-900">Pergunta</label>
                <input
                  type="text"
                  value={draft.title}
                  placeholder="Ex.: Foto da bancada limpa"
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-900">
                  Instrução complementar <span className="text-neutral-400 font-normal">— opcional</span>
                </label>
                <textarea
                  value={draft.description}
                  placeholder="Detalhes para orientar quem está tirando a foto."
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none resize-none"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-neutral-900">Modo de verificação</label>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between p-3 border rounded-xl border-pink-200 bg-pink-50/30">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-4 border-pink-500" />
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Automático</p>
                        <p className="text-[11px] text-neutral-500">A IA analisa e aprova em segundos.</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-pink-100 text-pink-600 text-[10px]">Recomendado</Badge>
                  </div>

                   <div className="flex items-center justify-between p-3 border border-neutral-100 rounded-xl opacity-50 bg-neutral-50 cursor-not-allowed">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Comparar com referência</p>
                        <p className="text-[11px] text-neutral-500">Compara com fotos padrão.</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Em breve</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-neutral-100 rounded-xl opacity-50 bg-neutral-50 cursor-not-allowed">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Múltiplas fotos</p>
                        <p className="text-[11px] text-neutral-500">Exigir vários ângulos do mesmo objeto.</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Em breve</Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumo da Verificação */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-neutral-900">Resumo da verificação</label>
              {isCompiling ? (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <p className="text-xs text-blue-700 font-medium">Preparando verificação inteligente...</p>
                </div>
              ) : policy?.summary ? (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
                  <p className="text-xs text-blue-800 leading-relaxed font-medium">{policy.summary}</p>
                  
                  {policy.verifiability === 'not_visual' && (
                    <div className="flex gap-2 text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-100">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <p className="text-[10px] leading-tight">Esta pergunta não parece verificável por foto.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-neutral-200 text-center">
                  <p className="text-xs text-neutral-400">Salve para gerar o resumo da IA.</p>
                </div>
              )}
            </div>

            {/* Configuração Avançada */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced" className="border-none">
                <AccordionTrigger className="text-sm font-bold py-2 hover:no-underline text-neutral-900">
                  Configuração avançada
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Evidência necessária</label>
                    <div className="space-y-2">
                      {(policy?.requiredVisibleEvidence || []).map((item: string, idx: number) => (
                        <input
                          key={idx}
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const next = [...(policy?.requiredVisibleEvidence || [])];
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
                      {(policy?.rejectionSignals || []).map((item: string, idx: number) => (
                        <input
                          key={idx}
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const next = [...(policy?.rejectionSignals || [])];
                            next[idx] = e.target.value;
                            handlePolicyChange({ rejectionSignals: next });
                          }}
                          className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg focus:ring-1 focus:ring-neutral-400 outline-none"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Nível de rigor</label>
                      <div className="px-3 py-2 text-xs bg-neutral-50 rounded-lg text-neutral-600 border border-neutral-200 font-medium">Padrão</div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Em caso de dúvida</label>
                      <div className="px-3 py-2 text-xs bg-neutral-50 rounded-lg text-neutral-600 border border-neutral-200 font-medium">Exigir outra foto</div>
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
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="w-full py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-pink-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
            >
              Salvar bloco
            </button>
            
            <button
              onClick={() => setIsTestModalOpen(true)}
              className="w-full py-3 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Testar verificação
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <CameraVerificationTestDialog
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        policy={policy}
        blockId={block.id}
        checklistId={checklistId}
      />
    </>
  );
}
