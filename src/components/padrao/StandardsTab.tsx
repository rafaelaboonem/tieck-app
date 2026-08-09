import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, ImageIcon, FlaskConical, Check, X, Archive, PlayCircle, Upload, Trash2, Maximize2 } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  createStandard,
  restoreStandard,
  activateStandard,
  prepareStandard,
  uploadReference,
  deleteReference,
  type VisualStandard,
  type VisualStandardReference,
} from "@/lib/visual-standards";
import { supabase } from "@/integrations/supabase/client";
import type { CameraQuestion, ChecklistProject } from "@/lib/camera-blocks";

interface Props {
  workspaceId: string;
  /** Contexto global da Central Visual (topo da página). */
  project: ChecklistProject | null;
  question: CameraQuestion | null;
  standard: VisualStandard | null;
  standards: VisualStandard[];
  loading: boolean;
  onChanged: () => void;
  onTest: (standard: VisualStandard) => void;
}

export function StandardsTab({
  workspaceId,
  project,
  question,
  standard,
  standards,
  loading,
  onChanged,
  onTest,
}: Props) {
  const [open, setOpen] = useState(false);
  const archived = standards.filter(
    (s) => s.archived_at && s.camera_block_id === question?.cameraBlockId,
  );
  const unlinked = standards.filter((s) => !s.archived_at && !s.camera_block_id);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return <EmptyState text="Selecione um projeto para começar." />;
  }
  if (project.cameraBlocks.length === 0) {
    return <EmptyState text="Este projeto ainda não possui perguntas com câmera." />;
  }
  if (!question) {
    return <EmptyState text="Selecione uma pergunta com câmera para ver o padrão visual." />;
  }

  return (
    <div className="space-y-5">
      {standard ? (
        <StandardCard standard={standard} onChanged={onChanged} onTest={onTest} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              Esta pergunta ainda não possui um padrão visual.
            </p>
            <Button className="bg-[#FF007F] hover:bg-[#e6006f]" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Configurar padrão visual
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <CreateStandardDialog
          workspaceId={workspaceId}
          projectId={project.id}
          question={question}
          onDone={() => { setOpen(false); onChanged(); }}
        />
      </Dialog>

      {!standard && unlinked.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Padrões antigos sem vínculo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Vincule um padrão criado antes desta estrutura à pergunta selecionada.
            </p>
            {unlinked.map((s) => (
              <LinkRow key={s.id} standard={s} projectId={project.id} question={question} onChanged={onChanged} />
            ))}
          </CardContent>
        </Card>
      )}

      {archived.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="h-4 w-4" /> Padrões arquivados desta pergunta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {archived.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs">
                <span className="truncate">{s.question}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await restoreStandard(s);
                      toast.success("Padrão restaurado.");
                      onChanged();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Restaurar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

function StandardCard({
  standard: s,
  onChanged,
  onTest,
}: {
  standard: VisualStandard;
  onChanged: () => void;
  onTest: (s: VisualStandard) => void;
}) {
  const questionChanged = Boolean(s.validated_question && s.validated_question !== s.question);
  const refs = s.references || [];
  const ref1 = refs.find(r => r.position === 1);
  const ref2 = refs.find(r => r.position === 2);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-lg">Padrão visual desta pergunta</CardTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {s.needs_validation && (
              <Badge variant="outline" className="bg-amber-500/15 text-amber-700">
                Precisa de validação
              </Badge>
            )}
            <Badge variant="outline" className={STATUS_TONE[s.status]}>
              {STATUS_LABEL[s.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-foreground">“{s.question}”</p>
        {questionChanged && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800">
            A pergunta foi alterada. Revise o padrão visual antes de ativá-lo novamente.
          </p>
        )}
        
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fotos de referência</Label>
          <div className="grid grid-cols-2 gap-4">
            <ReferenceSlot 
              standard={s} 
              position={1} 
              reference={ref1} 
              label="Principal" 
              onChanged={onChanged} 
            />
            <ReferenceSlot 
              standard={s} 
              position={2} 
              reference={ref2} 
              label="Complementar" 
              onChanged={onChanged} 
            />
          </div>
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] text-muted-foreground italic">
              * Exatamente duas fotos são necessárias para ativação.
            </p>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
              {refs.length} de 2
            </Badge>
          </div>
        </div>

        {s.internal_notes && <p className="text-xs text-muted-foreground">{s.internal_notes}</p>}

        <ActivationPanel standard={s} onChanged={onChanged} />

      </CardContent>
    </Card>
  );
}

function ReferenceSlot({ 
  standard, 
  position, 
  reference, 
  label, 
  onChanged 
}: { 
  standard: VisualStandard;
  position: 1 | 2;
  reference?: VisualStandardReference;
  label: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      await uploadReference(standard, file, position);
      toast.success(`${label} enviada.`);
      onChanged();
    } catch (err) {
      toast.error(`Falha no envio: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    if (!confirm(`Remover a referência ${label.toLowerCase()}?`)) return;
    setBusy(true);
    try {
      await deleteReference(standard, position);
      toast.success(`${label} removida.`);
      onChanged();
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const publicUrl = reference 
    ? supabase.storage.from("visual-standards").getPublicUrl(reference.storage_path).data.publicUrl
    : null;

  return (
    <div className="relative group">
      <div 
        className={`aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden ${
          publicUrl ? "border-solid border-muted" : "border-muted-foreground/20 hover:border-[#FF007F]/50 bg-muted/5"
        }`}
      >
        {busy && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
            <Loader2 className="h-5 w-5 animate-spin text-[#FF007F]" />
          </div>
        )}

        {publicUrl ? (
          <>
            <img 
              src={publicUrl} 
              alt={label} 
              className="absolute inset-0 w-full h-full object-cover" 
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
              <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => setPreviewOpen(true)}>
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full" onClick={onRemove} disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] h-7 px-2 text-muted-foreground hover:text-[#FF007F]"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="mr-1.5 h-3 w-3" /> Adicionar
            </Button>
          </>
        )}
      </div>
      
      <div className="absolute -top-2 left-2 px-1.5 py-0.5 bg-background border rounded text-[9px] font-bold uppercase tracking-tighter z-10">
        {label}
      </div>

      <input 
        ref={inputRef}
        type="file" 
        accept="image/jpeg,image/png,image/webp" 
        className="hidden" 
        onChange={onFileChange} 
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden border-none bg-black/90">
          {publicUrl && (
            <img 
              src={publicUrl} 
              alt={label} 
              className="w-full h-auto max-h-[85vh] object-contain" 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Vínculo manual: usado por padrões antigos, criados antes desta estrutura. */
function LinkRow({
  standard,
  projectId,
  question,
  onChanged,
}: {
  standard: VisualStandard;
  projectId: string;
  question: CameraQuestion;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs">
      <span className="truncate">{standard.question || standard.name}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await linkStandardToBlock(standard, {
              checklistId: projectId,
              cameraBlockId: question.cameraBlockId,
              question: question.question,
            });
            toast.success("Padrão vinculado à pergunta.");
            onChanged();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
        Vincular
      </Button>
    </div>
  );
}

function ActivationPanel({ standard, onChanged }: { standard: VisualStandard; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const checks = activationChecks(standard);
  const ready = canActivate(standard);
  const active = standard.status === "validated" && !standard.needs_validation;

  const prepare = async () => {
    setPreparing(true);
    try {
      const res = await prepareStandard(standard.workspace_id, standard.id);
      if (res.ok) {
        toast.success(res.message || "Padrão preparado com sucesso.");
        onChanged();
      } else {
        toast.error(res.message || "Não foi possível preparar o padrão.");
      }
    } catch (e) {
      toast.error(`Erro na preparação: ${(e as Error).message}`);
    } finally {
      setPreparing(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    try {
      await activateStandard(standard.id);
      toast.success("Padrão ativado.");
      onChanged();
    } catch (e) {
      toast.error(`Não foi possível ativar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-700">
        Padrão ativo.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Preparação do padrão</p>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-xs">
              {c.ok ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="flex flex-col">
                <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                {!c.ok && (
                  <span className="text-[10px] text-amber-600">
                    {c.key === "question" && "Defina a pergunta no editor."}
                    {c.key === "reference_1" && "Envie a foto principal."}
                    {c.key === "reference_2" && "Envie o ângulo complementar."}
                    {c.key === "accessible" && "Verificando acesso..."}
                    {c.key === "profile" && "Clique em 'Preparar padrão'."}
                    {c.key === "version" && "Aguarde a geração do perfil."}
                    {c.key === "verifiability" && "O padrão deve ser verificável."}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          disabled={preparing || busy || active} 
          onClick={prepare}
        >
          {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          Preparar padrão
        </Button>
        <Button 
          size="sm" 
          disabled={!ready || busy || preparing} 
          onClick={activate}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Ativar padrão
        </Button>
      </div>
    </div>
  );
}

function CreateStandardDialog({
  workspaceId,
  projectId,
  question,
  onDone,
}: {
  workspaceId: string;
  projectId: string;
  question: CameraQuestion;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNotes(""); setFile(null); }, [question.cameraBlockId]);

  const submit = async () => {
    setSaving(true);
    try {
      await createStandard({
        workspaceId,
        checklistId: projectId,
        cameraBlockId: question.cameraBlockId,
        question: question.question,
        internalNotes: notes,
        referenceFile: file,
      });
      toast.success("Padrão criado.");
      onDone();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Configurar padrão visual</DialogTitle>
        <DialogDescription>
          A pergunta vem do bloco de câmera do projeto e não precisa ser digitada novamente.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="rounded-lg border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Pergunta selecionada</p>
          <p className="mt-1">“{question.question}”</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vs-notes">Notas internas (opcional)</Label>
          <Textarea id="vs-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vs-ref">Foto de referência (opcional)</Label>
          <Input
            id="vs-ref"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Guardada em armazenamento privado e usada apenas como comparação durante os testes.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar padrão
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
