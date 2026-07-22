import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, ArrowRight, ImageIcon, Sparkles, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import {
  VISION_BUCKET,
  SPLITS,
  slugify,
  type Dataset,
  type SplitKey,
} from "@/lib/vision-datasets";
import { countCuratedByDataset } from "@/lib/curated-images";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/padrao/")({
  head: () => ({
    meta: [
      { title: "IA Visual · Padrões visuais" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DatasetsListPage,
});

const MIN_NORMAL = 5;

type PadraoStatus =
  | "not_started"
  | "in_progress"
  | "ready";

const PADRAO_STATUS_LABEL: Record<PadraoStatus, string> = {
  not_started: "Ainda não iniciado",
  in_progress: "Em preparação",
  ready: "Biblioteca pronta",
};

const PADRAO_STATUS_TONE: Record<PadraoStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

type DatasetWithStats = Dataset & {
  total: number;
  status: PadraoStatus;
  curated: { normal: number; anomalous: number; ignored: number; total: number };
};

function DatasetsListPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [datasets, setDatasets] = useState<DatasetWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"padroes" | "revisao">("padroes");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }
      if (!cancelled) setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vision_datasets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(`Erro ao carregar: ${error.message}`);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Dataset[];
    // Fetch counts for each dataset (parallel)
    const withStats = await Promise.all(
      rows.map(async (ds) => {
        const counts: Record<SplitKey, number> = {
          "train/normal": 0,
          "validation/normal": 0,
          "validation/anomalous": 0,
          "test/normal": 0,
          "test/anomalous": 0,
        };
        await Promise.all(
          SPLITS.map(async (s) => {
            const prefixes = ds.slug && ds.slug !== ds.id
              ? [`${ds.id}/${s.key}`, `${ds.slug}/${s.key}`]
              : [`${ds.id}/${s.key}`];
            const lists = await Promise.all(
              prefixes.map((prefix) => supabase.storage.from(VISION_BUCKET).list(prefix, { limit: 1000 })),
            );
            const names = new Set<string>();
            for (const { data: list } of lists) {
              for (const f of list ?? []) {
                if (f.name && f.name !== ".emptyFolderPlaceholder") names.add(f.name);
              }
            }
            counts[s.key] = names.size;
          }),
        );
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        let curated = { normal: 0, anomalous: 0, ignored: 0, total: 0 };
        try { curated = await countCuratedByDataset(ds.id); } catch { /* ignore */ }

        let status: PadraoStatus;
        if (curated.normal + curated.anomalous === 0) {
          status = "not_started";
        } else if (curated.normal >= MIN_NORMAL) {
          status = "ready";
        } else {
          status = "in_progress";
        }

        return { ...ds, total, status, curated };
      }),
    );
    setDatasets(withStats);
    setLoading(false);
  };

  useEffect(() => {
    if (authChecked) void load();
  }, [authChecked]);

  if (!authChecked) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-[#FF007F]/10 p-3">
              <Sparkles className="h-6 w-6 text-[#FF007F]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Padrões visuais</h1>
              <p className="mt-1 max-w-xl text-sm text-neutral-600">
                Ensine a IA o que é correto, o que é anomalia e o que ignorar. Cada padrão vira um modelo dedicado.
              </p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-[#FF007F] hover:bg-[#e6006f]">
                <Plus className="mr-2 h-4 w-4" /> Criar padrão visual
              </Button>
            </DialogTrigger>
            <CreateDatasetDialog
              onCreated={(ds) => {
                setOpen(false);
                navigate({ to: "/padrao/$publicId", params: { publicId: ds.public_id } });
              }}
            />
          </Dialog>
        </header>

        <div className="mb-8 inline-flex rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
          {([
            ["padroes", "Padrões visuais"],
            ["revisao", "Revisão para IA"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={
                "rounded-full px-5 py-2 text-sm font-medium transition-colors " +
                (tab === key
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:text-neutral-900")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "revisao" ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Clock className="h-10 w-10 text-neutral-400" />
              <p className="text-sm text-neutral-600 max-w-md">
                A fila de revisão para IA está sendo reconstruída. Em breve, imagens capturadas em checklists aparecerão aqui para classificação em lote.
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : datasets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <ImageIcon className="h-10 w-10 text-neutral-400" />
              <p className="text-sm text-neutral-600">
                Nenhum padrão visual ainda. Clique em "Criar padrão visual" para começar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {datasets.map((ds) => {
              const pendentes = Math.max(0, ds.total - ds.curated.total);
              return (
                <Card key={ds.id} className="flex h-full flex-col overflow-hidden border-neutral-200 shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-xl">{ds.name}</CardTitle>
                        <p className="mt-1 text-xs text-neutral-500">#{ds.public_id}</p>
                      </div>
                      <Badge className={PADRAO_STATUS_TONE[ds.status]} variant="outline">
                        {PADRAO_STATUS_LABEL[ds.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-5">
                    <p className="line-clamp-2 text-sm text-neutral-600">
                      {ds.description || "Sem descrição."}
                    </p>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-50 p-3">
                      <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Corretas" value={ds.curated.normal} />
                      <Stat icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Anomalias" value={ds.curated.anomalous} />
                      <Stat icon={<Clock className="h-4 w-4 text-neutral-500" />} label="Pendentes" value={pendentes} />
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-neutral-900 text-white hover:bg-neutral-800"
                      onClick={() => navigate({ to: "/padrao/$publicId", params: { publicId: ds.public_id } })}
                    >
                      Abrir padrão <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        </div>
      </div>
    </DashboardLayout>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {icon}
      <span className="text-lg font-semibold text-neutral-900">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  );
}

function CreateDatasetDialog({ onCreated }: { onCreated: (ds: Dataset) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [normalInstr, setNormalInstr] = useState("");
  const [anomalyInstr, setAnomalyInstr] = useState("");
  const [examples, setExamples] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do padrão.");
      return;
    }
    // Slug é apenas metadado legado. Gerado automaticamente com sufixo
    // aleatório para evitar colisões de unicidade. O identificador real
    // usado em rotas e relações é o UUID (vision_datasets.id).
    const base = slugify(name) || "padrao";
    const suffix = Math.random().toString(36).slice(2, 8);
    const finalSlug = `${base}-${suffix}`;
    setSaving(true);
    const { data, error } = await supabase
      .from("vision_datasets")
      .insert({
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || null,
        normal_instructions: normalInstr.trim() || null,
        anomaly_instructions: anomalyInstr.trim() || null,
        examples: examples.trim() || null,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success("Padrão criado. Agora envie as fotos.");
    onCreated(data as Dataset);
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Etapa 1 — Criar padrão visual</DialogTitle>
        <DialogDescription>
          Descreva o que a IA deve aprender. Depois você envia as fotos.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ds-name">Nome do padrão</Label>
          <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Bancada limpa" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ds-desc">Descrição</Label>
          <Textarea id="ds-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Do que se trata este padrão." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ds-normal">O que é considerado correto</Label>
          <Textarea id="ds-normal" rows={3} value={normalInstr} onChange={(e) => setNormalInstr(e.target.value)} placeholder="Descreva o padrão certo." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ds-anom">O que é considerado problema</Label>
          <Textarea id="ds-anom" rows={3} value={anomalyInstr} onChange={(e) => setAnomalyInstr(e.target.value)} placeholder="Descreva possíveis anomalias." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ds-ex">Exemplos de uso</Label>
          <Textarea id="ds-ex" rows={2} value={examples} onChange={(e) => setExamples(e.target.value)} placeholder="Onde e como este padrão será verificado." />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continuar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}