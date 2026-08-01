import { useEffect, useMemo, useState } from "react";
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
import { Loader2, Plus, ImageIcon, FlaskConical, Check, X, ExternalLink, Archive } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  createStandard,
  linkStandardToBlock,
  restoreStandard,
  activationChecks,
  canActivate,
  activateStandard,
  type VisualStandard,
} from "@/lib/visual-standards";
import { listChecklistProjects, type ChecklistProject } from "@/lib/camera-blocks";

interface Props {
  workspaceId: string;
  standards: VisualStandard[];
  loading: boolean;
  onCreated: () => void;
  onTest: (standard: VisualStandard) => void;
  /** Pré-seleção vinda do editor de checklist (?checklist=&block=). */
  presetChecklistId?: string | null;
  presetCameraBlockId?: string | null;
}

export function StandardsTab({
  workspaceId,
  standards,
  loading,
  onCreated,
  onTest,
  presetChecklistId,
  presetCameraBlockId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ChecklistProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    listChecklistProjects(workspaceId)
      .then((p) => { if (!cancelled) setProjects(p); })
      .catch((e) => toast.error(`Erro ao carregar projetos: ${(e as Error).message}`))
      .finally(() => { if (!cancelled) setProjectsLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, standards]);

  // Abrir automaticamente quando o editor de checklist envia projeto + bloco.
  useEffect(() => {
    if (presetChecklistId && presetCameraBlockId) {
      const exists = standards.some(
        (s) => s.camera_block_id === presetCameraBlockId && !s.archived_at,
      );
      if (!exists) setOpen(true);
    }
  }, [presetChecklistId, presetCameraBlockId, standards]);

  const active = standards.filter((s) => !s.archived_at);
  const archived = standards.filter((s) => s.archived_at);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cada padrão está ligado a uma pergunta com câmera de um projeto. A pergunta é escrita uma única vez, no checklist.
        </p>
        <Button className="bg-[#FF007F] hover:bg-[#e6006f]" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo padrão
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <CreateStandardDialog
          workspaceId={workspaceId}
          projects={projects}
          projectsLoading={projectsLoading}
          standards={standards}
          presetChecklistId={presetChecklistId ?? null}
          presetCameraBlockId={presetCameraBlockId ?? null}
          onDone={() => { setOpen(false); onCreated(); }}
        />
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhum padrão visual ainda. Escolha um projeto e uma pergunta com câmera para criar o primeiro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {active.map((s) => (
            <StandardCard
              key={s.id}
              standard={s}
              projects={projects}
              standards={standards}
              onChanged={onCreated}
              onTest={onTest}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="h-4 w-4" /> Padrões arquivados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              A pergunta de câmera foi removida do projeto. A referência e o histórico foram preservados.
            </p>
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
                      onChangedSafe(onCreated);
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

function onChangedSafe(fn: () => void) {
  try { fn(); } catch { /* noop */ }
}

function StandardCard({
  standard: s,
  projects,
  standards,
  onChanged,
  onTest,
}: {
  standard: VisualStandard;
  projects: ChecklistProject[];
  standards: VisualStandard[];
  onChanged: () => void;
  onTest: (s: VisualStandard) => void;
}) {
  const project = projects.find((p) => p.id === s.checklist_id) ?? null;
  const linked = Boolean(s.checklist_id && s.camera_block_id);
  const questionChanged = Boolean(
    s.validated_question && s.validated_question !== s.question,
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="truncate text-lg">{project ? project.title : "Sem projeto vinculado"}</CardTitle>
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
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-foreground">“{s.question}”</p>
          {questionChanged && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800">
              A pergunta foi alterada. Revise o padrão visual antes de ativá-lo novamente.
            </p>
          )}
          {s.internal_notes && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{s.internal_notes}</p>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{s.reference_path ? "Com referência" : "Sem referência"}</span>
          </div>
        </div>
        <div className="space-y-2">
          {linked ? (
            <ActivationPanel standard={s} onChanged={onChanged} />
          ) : (
            <LinkPanel standard={s} projects={projects} standards={standards} onChanged={onChanged} />
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => onTest(s)}>
            <FlaskConical className="mr-2 h-4 w-4" /> Testar no laboratório
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Vínculo manual: usado por padrões antigos, criados antes desta estrutura. */
function LinkPanel({
  standard,
  projects,
  standards,
  onChanged,
}: {
  standard: VisualStandard;
  projects: ChecklistProject[];
  standards: VisualStandard[];
  onChanged: () => void;
}) {
  const [checklistId, setChecklistId] = useState("");
  const [blockId, setBlockId] = useState("");
  const [busy, setBusy] = useState(false);
  const project = projects.find((p) => p.id === checklistId) ?? null;

  const takenBlockIds = new Set(
    standards.filter((s) => !s.archived_at && s.camera_block_id).map((s) => s.camera_block_id!),
  );

  const submit = async () => {
    const q = project?.cameraBlocks.find((b) => b.cameraBlockId === blockId);
    if (!project || !q) return;
    setBusy(true);
    try {
      await linkStandardToBlock(standard, {
        checklistId: project.id,
        cameraBlockId: q.cameraBlockId,
        question: q.question,
      });
      toast.success("Padrão vinculado à pergunta.");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">
        Este padrão ainda não está ligado a uma pergunta. Selecione o projeto e a pergunta.
      </p>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
        value={checklistId}
        onChange={(e) => { setChecklistId(e.target.value); setBlockId(""); }}
      >
        <option value="">Selecione o projeto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </select>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
        value={blockId}
        disabled={!project}
        onChange={(e) => setBlockId(e.target.value)}
      >
        <option value="">Selecione a pergunta</option>
        {(project?.cameraBlocks ?? []).map((b) => (
          <option key={b.cameraBlockId} value={b.cameraBlockId} disabled={takenBlockIds.has(b.cameraBlockId)}>
            {b.question}{takenBlockIds.has(b.cameraBlockId) ? " — Padrão configurado" : ""}
          </option>
        ))}
      </select>
      <Button size="sm" className="w-full" disabled={!blockId || busy} onClick={submit}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Vincular à pergunta
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
  projects,
  projectsLoading,
  standards,
  presetChecklistId,
  presetCameraBlockId,
  onDone,
}: {
  workspaceId: string;
  projects: ChecklistProject[];
  projectsLoading: boolean;
  standards: VisualStandard[];
  presetChecklistId: string | null;
  presetCameraBlockId: string | null;
  onDone: () => void;
}) {
  const [checklistId, setChecklistId] = useState(presetChecklistId ?? "");
  const [blockId, setBlockId] = useState(presetCameraBlockId ?? "");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (presetChecklistId) setChecklistId(presetChecklistId);
    if (presetCameraBlockId) setBlockId(presetCameraBlockId);
  }, [presetChecklistId, presetCameraBlockId]);

  const project = projects.find((p) => p.id === checklistId) ?? null;
  const takenBlockIds = useMemo(
    () => new Set(standards.filter((s) => !s.archived_at && s.camera_block_id).map((s) => s.camera_block_id!)),
    [standards],
  );
  const question = project?.cameraBlocks.find((b) => b.cameraBlockId === blockId) ?? null;
  const alreadyConfigured = Boolean(blockId && takenBlockIds.has(blockId));

  const submit = async () => {
    if (!project || !question) {
      toast.error("Selecione o projeto e a pergunta.");
      return;
    }
    if (alreadyConfigured) {
      toast.error("Esta pergunta já possui um padrão visual.");
      return;
    }
    setSaving(true);
    try {
      await createStandard({
        workspaceId,
        checklistId: project.id,
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
        <DialogTitle>Novo padrão visual</DialogTitle>
        <DialogDescription>
          A pergunta vem do bloco de câmera do projeto. Você não precisa digitá-la novamente.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vs-project">Selecione o projeto</Label>
          <select
            id="vs-project"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={checklistId}
            onChange={(e) => { setChecklistId(e.target.value); setBlockId(""); }}
            disabled={projectsLoading}
          >
            <option value="">{projectsLoading ? "Carregando…" : "Selecione o projeto"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {project && project.cameraBlocks.length === 0 ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">
              Este projeto ainda não possui perguntas com câmera.
            </p>
            <a
              href={`/checklist?id=${project.id}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#FF007F]"
            >
              <ExternalLink className="h-4 w-4" /> Abrir projeto
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="vs-question">Selecione a pergunta</Label>
            <select
              id="vs-question"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={blockId}
              disabled={!project}
              onChange={(e) => setBlockId(e.target.value)}
            >
              <option value="">Selecione a pergunta</option>
              {(project?.cameraBlocks ?? []).map((b) => (
                <option key={b.cameraBlockId} value={b.cameraBlockId} disabled={takenBlockIds.has(b.cameraBlockId)}>
                  {b.question}{takenBlockIds.has(b.cameraBlockId) ? " — Padrão configurado" : ""}
                </option>
              ))}
            </select>
            {alreadyConfigured && (
              <p className="text-xs text-amber-700">Esta pergunta já possui um padrão visual.</p>
            )}
          </div>
        )}

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
        <Button onClick={submit} disabled={saving || !question || alreadyConfigured}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar padrão
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
