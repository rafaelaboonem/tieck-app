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
          onDone={() => {
            setOpen(false);
            onChanged();
          }}
        />
      </Dialog>
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
  const refs = s.references || [];
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-lg">Padrão visual desta pergunta</CardTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Badge variant="outline" className={STATUS_TONE[s.status]}>
              {STATUS_LABEL[s.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-foreground">“{s.question}”</p>

        <div className="grid grid-cols-2 gap-4">
          <ReferenceSlot
            standard={s}
            position={1}
            reference={refs.find(r => r.position === 1)}
            label="Foto principal"
            onChanged={onChanged}
          />
          <ReferenceSlot
            standard={s}
            position={2}
            reference={refs.find(r => r.position === 2)}
            label="Ângulo complementar"
            onChanged={onChanged}
          />
        </div>

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
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadReference(standard, file, position);
      toast.success(`${label} enviada.`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!reference) return;
    setBusy(true);
    try {
      await deleteReference(standard, reference);
      toast.success(`${label} removida.`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted/50 transition-colors hover:bg-muted">
        {reference ? (
          <>
            <img
              src={supabase.storage.from('visual-standards').getPublicUrl(reference.storage_path).data.publicUrl}
              className="h-full w-full object-cover"
              alt={label}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={remove}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <button
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            <span className="text-[10px] font-medium uppercase tracking-wider">Enviar</span>
          </button>
        )}
        <input
          type="file"
          ref={inputRef}
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    </div>
  );
}

function ActivationPanel({ standard, onChanged }: { standard: VisualStandard; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  
  const activate = async () => {
    setBusy(true);
    try {
      await activateStandard(standard.id);
      toast.success("Padrão ativado.");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = standard.status === "ready";

  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <p className="text-sm font-medium">Ativação</p>
      <Button 
        className="w-full" 
        disabled={!ready || busy} 
        onClick={activate}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
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
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await createStandard({
        workspaceId,
        checklistId: projectId,
        cameraBlockId: question.cameraBlockId,
        question: question.question,
        internalNotes: notes,
      });
      toast.success("Padrão criado.");
      onDone();
    } catch (e) {
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Configurar padrão visual</DialogTitle>
        <DialogDescription>
          Crie o padrão visual para esta pergunta.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Pergunta</Label>
          <p className="text-sm font-medium">“{question.question}”</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vs-notes">Notas internas</Label>
          <Textarea id="vs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
