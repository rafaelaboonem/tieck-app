import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, ImageIcon, FlaskConical } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  createStandard,
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
                  <Badge variant="outline" className={STATUS_TONE[s.status]}>
                    {STATUS_LABEL[s.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-foreground">“{s.question}”</p>
                  {s.internal_notes && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{s.internal_notes}</p>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{s.test_count} teste(s)</span>
                    <span>
                      Assertividade: {s.accuracy == null ? "—" : `${Math.round(Number(s.accuracy) * 100)}%`}
                    </span>
                    <span>{s.reference_path ? "Com referência" : "Sem referência"}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => onTest(s)}>
                  <FlaskConical className="mr-2 h-4 w-4" /> Testar no laboratório
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
