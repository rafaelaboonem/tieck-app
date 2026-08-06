import { useEffect, useState } from "react";
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
import { Loader2, Plus, ImageIcon, FlaskConical, Check, X, Archive, PlayCircle } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  createStandard,
  linkStandardToBlock,
  restoreStandard,
  activationChecks,
  canActivate,
  activateStandard,
  prepareStandard,
  type VisualStandard,
} from "@/lib/visual-standards";
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
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">“{s.question}”</p>
        {questionChanged && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800">
            A pergunta foi alterada. Revise o padrão visual antes de ativá-lo novamente.
          </p>
        )}
        {s.internal_notes && <p className="text-xs text-muted-foreground">{s.internal_notes}</p>}
        <p className="text-xs text-muted-foreground">
          {s.reference_path ? "Com foto de referência" : "Sem foto de referência"}
        </p>

        <ActivationPanel standard={s} onChanged={onChanged} />

        <Button variant="outline" size="sm" className="w-full" onClick={() => onTest(s)}>
          <FlaskConical className="mr-2 h-4 w-4" /> Testar no laboratório
        </Button>
      </CardContent>
    </Card>
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
  const checks = activationChecks(standard);
  const ready = canActivate(standard);
  const active = standard.status === "validated" && !standard.needs_validation;

  const activate = async () => {
    setBusy(true);
    try {
      await activateStandard(standard);
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
    <div className="space-y-2 rounded-md border p-2">
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-xs">
            {c.ok ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            )}
            <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
      <Button size="sm" className="w-full" disabled={!ready || busy} onClick={activate}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Ativar padrão
      </Button>
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
