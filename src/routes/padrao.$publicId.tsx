import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, ImageIcon, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/padrao/$publicId")({
  head: () => ({
    meta: [
      { title: "Padrão visual · Biblioteca" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PadraoDetailPage,
});

type Dataset = {
  id: string;
  public_id: string;
  slug: string;
  name: string;
  description: string | null;
  normal_instructions: string | null;
  anomaly_instructions: string | null;
  examples: string | null;
  created_at: string;
};

type CuratedImage = {
  id: string;
  classification: string;
  curated_storage_path: string | null;
  source_storage_path: string;
  reviewed_at: string;
  note: string | null;
};

function PadraoDetailPage() {
  const navigate = useNavigate();
  const { publicId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [images, setImages] = useState<CuratedImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }
      const { data: ds, error } = await supabase
        .from("vision_datasets")
        .select("*")
        .eq("public_id", publicId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error(`Erro ao carregar padrão: ${error.message}`);
        setLoading(false);
        return;
      }
      if (!ds) {
        setLoading(false);
        return;
      }
      setDataset(ds as Dataset);
      const { data: imgs } = await supabase
        .from("vision_curated_images")
        .select("id, classification, curated_storage_path, source_storage_path, reviewed_at, note")
        .eq("dataset_id", (ds as Dataset).id)
        .order("reviewed_at", { ascending: false })
        .limit(200);
      if (!cancelled) {
        setImages((imgs ?? []) as CuratedImage[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicId, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!dataset) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/padrao" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Card className="mt-6">
            <CardContent className="py-16 text-center text-sm text-neutral-600">
              Padrão não encontrado.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const normalCount = images.filter((i) => i.classification === "normal").length;
  const anomalousCount = images.filter((i) => i.classification === "anomalous").length;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/padrao" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar aos padrões
        </Button>

        <header className="mt-4 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{dataset.name}</h1>
          <p className="mt-1 text-xs text-neutral-500">#{dataset.public_id}</p>
          {dataset.description ? (
            <p className="mt-3 max-w-2xl text-sm text-neutral-600">{dataset.description}</p>
          ) : null}
        </header>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-xs text-neutral-500">Corretas</p>
                <p className="text-xl font-semibold">{normalCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xs text-neutral-500">Anomalias</p>
                <p className="text-xl font-semibold">{anomalousCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <ImageIcon className="h-5 w-5 text-neutral-500" />
              <div>
                <p className="text-xs text-neutral-500">Total curado</p>
                <p className="text-xl font-semibold">{images.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {(dataset.normal_instructions || dataset.anomaly_instructions || dataset.examples) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base">Descrição do padrão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {dataset.normal_instructions ? (
                <div>
                  <p className="font-medium text-neutral-800">Correto</p>
                  <p className="text-neutral-600 whitespace-pre-wrap">{dataset.normal_instructions}</p>
                </div>
              ) : null}
              {dataset.anomaly_instructions ? (
                <div>
                  <p className="font-medium text-neutral-800">Anomalia</p>
                  <p className="text-neutral-600 whitespace-pre-wrap">{dataset.anomaly_instructions}</p>
                </div>
              ) : null}
              {dataset.examples ? (
                <div>
                  <p className="font-medium text-neutral-800">Exemplos</p>
                  <p className="text-neutral-600 whitespace-pre-wrap">{dataset.examples}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Biblioteca de imagens curadas</CardTitle>
          </CardHeader>
          <CardContent>
            {images.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">
                Nenhuma imagem curada ainda.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 text-sm">
                {images.map((img) => (
                  <li key={img.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-800">
                        {img.source_storage_path.split("/").pop()}
                      </p>
                      {img.note ? (
                        <p className="truncate text-xs text-neutral-500">{img.note}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="ml-4 shrink-0">
                      {img.classification}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
