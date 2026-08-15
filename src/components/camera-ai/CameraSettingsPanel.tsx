import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, Play } from "lucide-react";
import { CameraVerificationPolicyV1, PublishedBlock } from "@/server/camera-ai/schema";
import { CameraVerificationTestDialog } from "./CameraVerificationTestDialog";

interface CameraDraft {
  title: string;
  description: string;
  required: boolean;
  mode: string;
  policy: CameraVerificationPolicyV1 | undefined;
}

interface CameraSettingsPanelProps {
  block: PublishedBlock;
  isOpen: boolean;
  onClose: () => void;
  onSave: (patch: any) => void;
  isCompiling: boolean;
  checklistId: string;
}

export function CameraSettingsPanel({ block, isOpen, onClose, onSave, isCompiling, checklistId }: CameraSettingsPanelProps) {
  const [draft, setDraft] = useState<CameraDraft>({
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

  const handleFieldChange = (field: keyof CameraDraft, value: any) => {
    setDraft(prev => ({ ...prev, [field]: value }));
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
      cameraAiPolicy: draft.policy
    });
    setHasChanges(false);
  };

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
                  </div>
                   <div className="flex items-center justify-between p-3 border border-neutral-100 rounded-xl opacity-50 bg-neutral-50">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
                      <p className="text-sm font-bold text-neutral-900">Comparar com referência</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Em breve</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-neutral-100 rounded-xl opacity-50 bg-neutral-50">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
                      <p className="text-sm font-bold text-neutral-900">Múltiplas fotos</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Em breve</Badge>
                  </div>
                </div>
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
                  {/* ... fields ... */}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="sticky bottom-0 bg-white pt-6 pb-2 border-t flex flex-col gap-3">
            <button onClick={handleSave} disabled={!hasChanges} className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">Salvar bloco</button>
            <button onClick={() => setIsTestModalOpen(true)} className="w-full py-3 bg-white text-neutral-700 border rounded-xl font-bold text-sm flex items-center justify-center gap-2">
              <Play className="w-3.5 h-3.5 fill-current" /> Testar verificação
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
