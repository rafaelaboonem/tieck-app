import { Loader2, Plus, ImageIcon, Upload, Trash2, Camera, CheckCircle2, XCircle, Search, ChevronRight, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { uploadReference, deleteReference, type VisualStandard, type VisualStandardReference } from "@/lib/visual-standards";

export function PadraoHeader() {
  return (
    <header className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Padrões de foto</h1>
          <p className="text-muted-foreground">Defina as referências que serão usadas para verificar as fotos dos seus checklists.</p>
        </div>
        <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/20">OpenAI Lab</Badge>
      </div>
    </header>
  );
}

export function ProjectSelector({ projects, selectedId, onChange, loading }: any) {
  return (
    <div className="mb-6">
      <label className="text-sm font-medium mb-2 block">Projeto</label>
      <select
        className="w-full h-12 px-4 rounded-xl border border-input bg-background"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
      >
        <option value="">Selecione um projeto</option>
        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    </div>
  );
}

export function ReferenceImageSlot({ standard, position, reference, label, onChanged }: { standard: VisualStandard, position: 1 | 2, reference?: VisualStandardReference, label: string, onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadReference(standard, file, position);
      toast.success(`${label} atualizada.`);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!reference) return;
    setBusy(true);
    try {
      await deleteReference(standard, reference);
      toast.success(`${label} removida.`);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="aspect-video rounded-xl border-2 border-dashed bg-muted flex items-center justify-center overflow-hidden relative">
        {reference ? (
          <>
            <img src={supabase.storage.from('visual-standards').getPublicUrl(reference.storage_path).data.publicUrl} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
              <Button variant="destructive" size="icon" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <Button variant="ghost" onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Adicionar</Button>
        )}
        <input type="file" ref={inputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </div>
    </div>
  );
}
