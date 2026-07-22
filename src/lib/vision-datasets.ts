export const VISION_BUCKET = "vision-datasets";

export type SplitKey =
  | "train/normal"
  | "validation/normal"
  | "validation/anomalous"
  | "test/normal"
  | "test/anomalous";

export type SplitCategory = "normal" | "anomalous";

export type SplitConfig = {
  key: SplitKey;
  friendly: string;
  purpose: string;
  showWhat: string;
  avoid: string;
  category: SplitCategory;
  min: number;
  technicalPath: string;
};

export const SPLITS: SplitConfig[] = [
  {
    key: "train/normal",
    friendly: "Fotos corretas para ensinar a IA",
    purpose: "Ensinam a IA como é o padrão correto.",
    showWhat: "O ambiente exatamente dentro do padrão esperado, variando ângulo, iluminação e distância.",
    avoid: "Fotos borradas, ambientes diferentes ou qualquer problema visível.",
    category: "normal",
    min: 50,
    technicalPath: "train / normal",
  },
  {
    key: "validation/normal",
    friendly: "Fotos corretas para validar",
    purpose: "Usadas para ajustar a IA e conferir se ela reconhece o padrão correto.",
    showWhat: "Novas fotos do padrão correto, diferentes das usadas no treino.",
    avoid: "Repetir imagens já enviadas em outros grupos.",
    category: "normal",
    min: 10,
    technicalPath: "validation / normal",
  },
  {
    key: "validation/anomalous",
    friendly: "Fotos com problemas para validar",
    purpose: "Ajudam a IA a calibrar como identificar quando algo está errado.",
    showWhat: "Problemas reais e variados, cada tipo de falha aparecendo em algumas fotos.",
    avoid: "Problemas idênticos repetidos ou fotos sem nenhum problema claro.",
    category: "anomalous",
    min: 5,
    technicalPath: "validation / anomalous",
  },
  {
    key: "test/normal",
    friendly: "Fotos corretas para teste final",
    purpose: "Avaliam a IA depois do treino, com fotos que ela nunca viu.",
    showWhat: "Fotos novas do padrão correto, distintas de treino e validação.",
    avoid: "Reaproveitar fotos de treino ou validação.",
    category: "normal",
    min: 10,
    technicalPath: "test / normal",
  },
  {
    key: "test/anomalous",
    friendly: "Fotos com problemas para teste final",
    purpose: "Verificam se a IA consegue detectar problemas em fotos novas.",
    showWhat: "Problemas variados que ainda não foram enviados em outros grupos.",
    avoid: "Repetir problemas já usados no grupo de validação.",
    category: "anomalous",
    min: 5,
    technicalPath: "test / anomalous",
  },
];

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
export const MIN_RESOLUTION = 256; // px, warn below

export type Dataset = {
  id: string;
  slug: string;
  public_id: string;
  name: string;
  description: string | null;
  normal_instructions: string | null;
  anomaly_instructions: string | null;
  examples: string | null;
  created_at: string;
};

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type DatasetOverallStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_validation"
  | "ready_for_training";

export function overallStatus(counts: Record<SplitKey, number>): DatasetOverallStatus {
  const total = SPLITS.reduce((acc, s) => acc + (counts[s.key] ?? 0), 0);
  if (total === 0) return "not_started";
  const allMeetMin = SPLITS.every((s) => (counts[s.key] ?? 0) >= s.min);
  const someMeetMin = SPLITS.some((s) => (counts[s.key] ?? 0) >= s.min);
  if (allMeetMin) return "ready_for_training";
  if (someMeetMin) return "ready_for_validation";
  return "in_progress";
}

export const STATUS_LABEL: Record<DatasetOverallStatus, string> = {
  not_started: "Ainda não iniciado",
  in_progress: "Em preparação",
  ready_for_validation: "Pronto para validação",
  ready_for_training: "Pronto para treinamento",
};