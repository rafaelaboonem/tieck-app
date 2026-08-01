import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, ImageIcon, FlaskConical, Check, X } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  createStandard,
  activationChecks,
  canActivate,
  activateStandard,
  type VisualStandard,
} from "@/lib/visual-standards";

interface Props {
  workspaceId: string;
  standards: VisualStandard[];
  loading: boolean;
  onCreated: () => void;
  onTest: (standard: VisualStandard) => void;
}

export function StandardsTab({ workspaceId, standards, loading, onCreated, onTest }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cada padrão descreve, em linguagem natural, o que a IA deve verificar em uma foto.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#FF007F] hover:bg-[#e6006f]">
              <Plus className="mr-2 h-4 w-4" /> Novo padrão
            </Button>
          </DialogTrigger>
          <CreateStandardDialog
            workspaceId={workspaceId}
            onDone={() => {
              setOpen(false);
              onCreated();
            }}
          />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : standards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhum padrão visual ainda. Crie o primeiro descrevendo a pergunta que a IA deve responder sobre a foto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {standards.map((s) => (
            <Card key={s.id} className="flex h-full flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="truncate text-lg">{s.name}</CardTitle>
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
                  {s.internal_notes && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{s.internal_notes}</p>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{s.reference_path ? "Com referência" : "Sem referência"}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <ActivationPanel standard={s} onChanged={onCreated} />
                  <Button variant="outline" size="sm" className="w-full" onClick={() => onTest(s)}>
                    <FlaskConical className="mr-2 h-4 w-4" /> Testar no laboratório
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivationPanel({ standard, onChanged }: { standard: VisualStandard; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const checks = activationChecks(standard);
  const ready = canActivate(standard);
  const active = standard.status === "validated";

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

function CreateStandardDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !question.trim()) {
      toast.error("Informe o nome e a pergunta do padrão.");
      return;
    }
    setSaving(true);
    try {
      await createStandard({
        workspaceId,
        name,
        question,
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
          A pergunta é o que a IA vai responder olhando para a foto enviada no checklist.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vs-name">Nome</Label>
          <Input id="vs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Bancada limpa" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vs-question">Pergunta para a IA</Label>
          <Textarea
            id="vs-question"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex: A bancada está limpa e sem objetos fora do lugar?"
          />
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
