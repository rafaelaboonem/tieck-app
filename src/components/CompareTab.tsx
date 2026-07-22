import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  GitCompare,
  Grid3x3,
  LayoutList,
  LineChart,
  CalendarDays,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ResponseRow = {
  id: string;
  visitor_id: string;
  created_at: string;
  answers: Record<string, any>;
};

type Mode = "pivot" | "timeline" | "diff" | "group" | "heatmap";

const MODES: { id: Mode; label: string; icon: any; desc: string }[] = [
  { id: "pivot", label: "Por pergunta", icon: LayoutList, desc: "Veja todas as respostas de uma pergunta lado a lado por data." },
  { id: "timeline", label: "Linha do tempo", icon: LineChart, desc: "Evolução de uma pergunta ao longo do tempo." },
  { id: "diff", label: "Comparar 2 envios", icon: GitCompare, desc: "Compare dois envios lado a lado e destaque diferenças." },
  { id: "group", label: "Agrupar por período", icon: CalendarDays, desc: "Agrupe envios por dia, semana ou mês." },
  { id: "heatmap", label: "Heatmap", icon: Grid3x3, desc: "Mapa de calor das respostas por pergunta e por dia." },
];

function valueToText(v: any): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) {
    if (v[0]?.url) return `${v.length} arquivo(s)`;
    return v.join(", ");
  }
  if (typeof v === "object") {
    if (v.url) return v.type?.startsWith("image/") ? "📷 imagem" : "📎 arquivo";
    return JSON.stringify(v);
  }
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

function valueToNumber(v: any): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

// Extract file-like entries ({url, type?, name?}) from any value shape
function extractFiles(v: any): { url: string; type?: string; name?: string }[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x) => x && typeof x === "object" && typeof x.url === "string");
}

function isImageFile(f: { url: string; type?: string; name?: string }) {
  if (f.type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i.test(f.url);
}

/* ─────────────── Lightbox (in-app image viewer) ─────────────── */
type LightboxImage = { url: string; name?: string };
type LightboxCtx = { open: (images: LightboxImage[], index: number) => void };
const LightboxContext = createContext<LightboxCtx | null>(null);
const useLightbox = () => useContext(LightboxContext);

function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [index, setIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((imgs: LightboxImage[], i: number) => {
    setImages(imgs);
    setIndex(Math.max(0, Math.min(i, imgs.length - 1)));
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const prev = useCallback(
    () => setIndex((i) => (images.length ? (i - 1 + images.length) % images.length : 0)),
    [images.length],
  );
  const next = useCallback(
    () => setIndex((i) => (images.length ? (i + 1) % images.length : 0)),
    [images.length],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close, prev, next]);

  const current = images[index];

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {isOpen && current && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
            aria-label="Fechar"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                aria-label="Anterior"
                title="Anterior (←)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                aria-label="Próxima"
                title="Próxima (→)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div
            className="max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={current.url}
              alt={current.name || "imagem"}
              className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="text-xs text-white/80 font-medium flex items-center gap-3">
              {current.name && <span className="truncate max-w-[60vw]">{current.name}</span>}
              {images.length > 1 && (
                <span className="px-2 py-0.5 rounded bg-white/10">
                  {index + 1} / {images.length}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </LightboxContext.Provider>
  );
}

// Stable string for diff comparison (uses URLs for files)
function valueToCompare(v: any): string {
  const files = extractFiles(v);
  if (files.length) return files.map((f) => f.url).join("|");
  return valueToText(v);
}

// Inline renderer: shows thumbnails for images, links for files, text otherwise
function ValueCell({ value, scopeImages }: { value: any; scopeImages?: LightboxImage[] }) {
  if (value == null || value === "") return <span className="text-neutral-400">—</span>;
  const files = extractFiles(value);
  if (files.length > 0) {
    const localImages = files.filter(isImageFile);
    const gallery = scopeImages && scopeImages.length > 0 ? scopeImages : localImages;
    const lightbox = useLightbox();
    return (
      <div className="flex flex-wrap gap-1.5">
        {files.map((f, i) =>
          isImageFile(f) ? (
            <button
              key={i}
              type="button"
              onClick={() => {
                const idx = gallery.findIndex((x) => x.url === f.url);
                lightbox?.open(gallery, Math.max(0, idx));
              }}
              className="block w-14 h-14 rounded-md overflow-hidden border border-neutral-200 bg-neutral-50 hover:ring-2 hover:ring-[#FF007F] transition cursor-zoom-in"
              title={f.name || "Abrir imagem"}
            >
              <img src={f.url} alt={f.name || "envio"} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ) : (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-700 hover:border-[#FF007F] hover:text-[#FF007F]"
              title={f.name || f.url}
            >
              📎 {f.name || "arquivo"}
            </a>
          ),
        )}
      </div>
    );
  }
  return <span>{valueToText(value)}</span>;
}

export function CompareTab({
  responses,
  blocks,
}: {
  responses: ResponseRow[];
  blocks: any[];
}) {
  const [mode, setMode] = useState<Mode>("pivot");

  const labelForBlock = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    return b?.subtitle || b?.value || b?.placeholder || b?.type || id.slice(0, 8);
  };

  // All block ids ever answered, ordered by checklist block order when possible
  const questionIds = useMemo(() => {
    const seen = new Set<string>();
    responses.forEach((r) => Object.keys(r.answers || {}).forEach((k) => seen.add(k)));
    const ordered: string[] = [];
    blocks.forEach((b) => {
      if (seen.has(b.id)) {
        ordered.push(b.id);
        seen.delete(b.id);
      }
    });
    return [...ordered, ...Array.from(seen)];
  }, [responses, blocks]);

  const fmtDate = (iso: string) =>
    format(new Date(iso), "dd/MM HH:mm", { locale: ptBR });

  if (responses.length === 0) {
    return (
      <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center">
        <BarChart3 className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
        <p className="text-sm text-neutral-500">
          Sem envios completos ainda. Quando começarem a chegar, você poderá comparar respostas aqui.
        </p>
      </div>
    );
  }

  return (
    <LightboxProvider>
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-2 flex flex-wrap gap-1">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                active
                  ? "bg-[#FF007F] text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 px-1">
        {MODES.find((m) => m.id === mode)?.desc}
      </p>

      {mode === "pivot" && (
        <PivotView responses={responses} questionIds={questionIds} labelForBlock={labelForBlock} fmtDate={fmtDate} />
      )}
      {mode === "timeline" && (
        <TimelineView responses={responses} questionIds={questionIds} labelForBlock={labelForBlock} />
      )}
      {mode === "diff" && (
        <DiffView responses={responses} questionIds={questionIds} labelForBlock={labelForBlock} fmtDate={fmtDate} />
      )}
      {mode === "group" && (
        <GroupView responses={responses} questionIds={questionIds} labelForBlock={labelForBlock} />
      )}
      {mode === "heatmap" && (
        <HeatmapView responses={responses} questionIds={questionIds} labelForBlock={labelForBlock} />
      )}
    </div>
    </LightboxProvider>
  );
}

/* ─────────────── 1. PIVOT (Por pergunta) ─────────────── */
function PivotView({
  responses,
  questionIds,
  labelForBlock,
  fmtDate,
}: any) {
  const [selected, setSelected] = useState<string>(questionIds[0] || "");
  if (!selected) return null;

  const rows = responses
    .map((r: ResponseRow) => ({
      date: r.created_at,
      visitor: r.visitor_id,
      value: r.answers?.[selected],
    }))
    .filter((x: any) => x.value !== undefined);

  // Scope: all images of this question across all dates (in display order)
  const scopeImages: LightboxImage[] = rows.flatMap((r: any) => {
    const dateLabel = format(new Date(r.date), "dd/MM HH:mm", { locale: ptBR });
    return extractFiles(r.value)
      .filter(isImageFile)
      .map((f) => ({ url: f.url, name: dateLabel }));
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-neutral-500">Pergunta:</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold text-neutral-900 outline-none focus:border-[#FF007F]"
        >
          {questionIds.map((id: string) => (
            <option key={id} value={id}>
              {labelForBlock(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-neutral-100 rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-bold">Data</th>
              <th className="text-left px-4 py-2.5 font-bold">Respondente</th>
              <th className="text-left px-4 py-2.5 font-bold">Resposta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i} className="border-t border-neutral-100">
                <td className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-4 py-2.5 text-neutral-500 font-mono text-xs">{r.visitor.slice(0, 10)}…</td>
                <td className="px-4 py-2.5 text-neutral-900"><ValueCell value={r.value} scopeImages={scopeImages} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────── 2. TIMELINE ─────────────── */
function TimelineView({ responses, questionIds, labelForBlock }: any) {
  const [selected, setSelected] = useState<string>(questionIds[0] || "");
  if (!selected) return null;

  const series = [...responses]
    .reverse() // chronological
    .map((r: ResponseRow) => ({
      date: new Date(r.created_at),
      raw: r.answers?.[selected],
      num: valueToNumber(r.answers?.[selected]),
    }))
    .filter((p) => p.raw !== undefined);

  const isNumeric = series.length > 0 && series.every((p) => p.num !== null);

  // Scope: all images of this question across all dates (chronological)
  const scopeImages: LightboxImage[] = series.flatMap((p) => {
    const dateLabel = format(p.date, "dd/MM HH:mm", { locale: ptBR });
    return extractFiles(p.raw)
      .filter(isImageFile)
      .map((f) => ({ url: f.url, name: dateLabel }));
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-neutral-500">Pergunta:</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold text-neutral-900 outline-none focus:border-[#FF007F]"
        >
          {questionIds.map((id: string) => (
            <option key={id} value={id}>
              {labelForBlock(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-neutral-100 rounded-2xl bg-white p-6">
        {isNumeric ? (
          <Sparkline points={series.map((p) => ({ x: p.date.getTime(), y: p.num as number, label: format(p.date, "dd/MM", { locale: ptBR }) }))} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {series.map((p, i) => {
              const files = extractFiles(p.raw);
              const txt = valueToText(p.raw);
              const isPositive = files.length === 0 && /^(sim|true|ok|conforme|✅)/i.test(txt);
              const isNegative = files.length === 0 && /^(não|nao|false|❌|reprovado)/i.test(txt);
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border min-w-[64px] max-w-[120px] ${
                    isPositive
                      ? "bg-green-50 border-green-200"
                      : isNegative
                        ? "bg-red-50 border-red-200"
                        : "bg-neutral-50 border-neutral-200"
                  }`}
                  title={txt}
                >
                  <span className="text-[10px] text-neutral-500 font-medium">
                    {format(p.date, "dd/MM", { locale: ptBR })}
                  </span>
                  {files.length > 0 ? (
                    <ValueCell value={p.raw} scopeImages={scopeImages} />
                  ) : (
                    <span className="text-xs font-bold text-neutral-800 max-w-[100px] truncate">{txt}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: { x: number; y: number; label: string }[] }) {
  if (points.length === 0) return <p className="text-sm text-neutral-400">Sem dados.</p>;
  const w = 720;
  const h = 200;
  const pad = 32;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const stepX = points.length === 1 ? 0 : (w - pad * 2) / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p.y - minY) / rangeY) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[600px] h-[200px]">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e5e5" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e5e5" />
        <text x={pad - 6} y={pad + 4} textAnchor="end" fontSize="10" fill="#737373">{maxY}</text>
        <text x={pad - 6} y={h - pad + 4} textAnchor="end" fontSize="10" fill="#737373">{minY}</text>
        <path d={path} fill="none" stroke="#FF007F" strokeWidth="2" />
        {points.map((p, i) => {
          const x = pad + i * stepX;
          const y = h - pad - ((p.y - minY) / rangeY) * (h - pad * 2);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill="#FF007F" />
              <text x={x} y={h - pad + 14} textAnchor="middle" fontSize="10" fill="#737373">{p.label}</text>
              <text x={x} y={y - 8} textAnchor="middle" fontSize="10" fill="#171717" fontWeight="bold">{p.y}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────── 3. DIFF (2 envios lado a lado) ─────────────── */
function DiffView({ responses, questionIds, labelForBlock, fmtDate }: any) {
  const [aId, setAId] = useState<string>(responses[0]?.id || "");
  const [bId, setBId] = useState<string>(responses[1]?.id || responses[0]?.id || "");
  const a = responses.find((r: ResponseRow) => r.id === aId);
  const b = responses.find((r: ResponseRow) => r.id === bId);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Envio A", value: aId, setter: setAId },
          { label: "Envio B", value: bId, setter: setBId },
        ].map((sel) => (
          <div key={sel.label} className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-500 w-16">{sel.label}:</span>
            <select
              value={sel.value}
              onChange={(e) => sel.setter(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-bold text-neutral-900 outline-none focus:border-[#FF007F]"
            >
              {responses.map((r: ResponseRow) => (
                <option key={r.id} value={r.id}>
                  {fmtDate(r.created_at)} — {r.visitor_id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="border border-neutral-100 rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-bold w-1/3">Pergunta</th>
              <th className="text-left px-4 py-2.5 font-bold">Envio A</th>
              <th className="text-left px-4 py-2.5 font-bold">Envio B</th>
            </tr>
          </thead>
          <tbody>
            {questionIds.map((qid: string) => {
              const rawA = a?.answers?.[qid];
              const rawB = b?.answers?.[qid];
              const diff = valueToCompare(rawA) !== valueToCompare(rawB);
              const imgsA = extractFiles(rawA).filter(isImageFile)
                .map((f) => ({ url: f.url, name: `Envio A — ${a ? fmtDate(a.created_at) : ""}` }));
              const imgsB = extractFiles(rawB).filter(isImageFile)
                .map((f) => ({ url: f.url, name: `Envio B — ${b ? fmtDate(b.created_at) : ""}` }));
              const rowScope: LightboxImage[] = [...imgsA, ...imgsB];
              return (
                <tr key={qid} className={`border-t border-neutral-100 ${diff ? "bg-amber-50/40" : ""}`}>
                  <td className="px-4 py-2.5 text-neutral-500 font-medium">{labelForBlock(qid)}</td>
                  <td className={`px-4 py-2.5 ${diff ? "text-amber-700 font-bold" : "text-neutral-800"}`}><ValueCell value={rawA} scopeImages={rowScope} /></td>
                  <td className={`px-4 py-2.5 ${diff ? "text-amber-700 font-bold" : "text-neutral-800"}`}><ValueCell value={rawB} scopeImages={rowScope} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────── 4. GROUP BY PERIOD ─────────────── */
function GroupView({ responses, questionIds, labelForBlock }: any) {
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");

  const groups = useMemo(() => {
    const map = new Map<string, ResponseRow[]>();
    responses.forEach((r: ResponseRow) => {
      const d = new Date(r.created_at);
      let key = "";
      if (grain === "day") key = format(d, "yyyy-MM-dd");
      else if (grain === "month") key = format(d, "yyyy-MM");
      else {
        const tmp = new Date(d);
        tmp.setDate(tmp.getDate() - tmp.getDay());
        key = format(tmp, "yyyy-MM-dd");
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [responses, grain]);

  const labelFor = (key: string) => {
    const d = new Date(key);
    if (grain === "day") return format(d, "EEEE, dd 'de' MMMM", { locale: ptBR });
    if (grain === "week") return `Semana de ${format(d, "dd/MM", { locale: ptBR })}`;
    return format(d, "MMMM 'de' yyyy", { locale: ptBR });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-neutral-500">Agrupar por:</span>
        <div className="inline-flex p-1 bg-neutral-100 rounded-lg">
          {(["day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGrain(g)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                grain === g ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {g === "day" ? "Dia" : g === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {groups.map(([key, items]) => {
          // numeric averages
          const numericStats = questionIds
            .map((qid: string) => {
              const nums = items
                .map((r: ResponseRow) => valueToNumber(r.answers?.[qid]))
                .filter((n: number | null): n is number => n !== null);
              if (nums.length === 0) return null;
              const avg = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
              return { qid, avg, count: nums.length };
            })
            .filter(Boolean);

          return (
            <div key={key} className="border border-neutral-100 rounded-2xl bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-neutral-900 capitalize">{labelFor(key)}</h4>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FF007F] text-white">
                  {items.length} envio{items.length > 1 ? "s" : ""}
                </span>
              </div>
              {numericStats.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {numericStats.map((s: any) => (
                    <div key={s.qid} className="bg-neutral-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wide truncate">
                        {labelForBlock(s.qid)}
                      </p>
                      <p className="text-sm font-bold text-neutral-900">
                        Média: {s.avg.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────── 5. HEATMAP ─────────────── */
function HeatmapView({ responses, questionIds, labelForBlock }: any) {
  // Build days x questions grid
  const days = useMemo(() => {
    const set = new Set<string>();
    responses.forEach((r: ResponseRow) => set.add(format(new Date(r.created_at), "yyyy-MM-dd")));
    return Array.from(set).sort();
  }, [responses]);

  const cellFor = (qid: string, day: string) => {
    const matches = responses.filter(
      (r: ResponseRow) => format(new Date(r.created_at), "yyyy-MM-dd") === day && r.answers?.[qid] !== undefined,
    );
    if (matches.length === 0) return { color: "bg-neutral-100", text: "—", title: "Sem resposta" };
    let pos = 0;
    let neg = 0;
    matches.forEach((r: ResponseRow) => {
      const t = valueToText(r.answers[qid]).toLowerCase();
      if (/^(sim|true|ok|conforme|✅)/.test(t)) pos++;
      else if (/^(não|nao|false|❌|reprovado)/.test(t)) neg++;
    });
    if (pos + neg === 0) {
      // numeric: average
      const nums = matches
        .map((r: ResponseRow) => valueToNumber(r.answers[qid]))
        .filter((n: number | null): n is number => n !== null);
      if (nums.length > 0) {
        const avg = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
        return { color: "bg-blue-100 text-blue-900", text: avg.toFixed(1), title: `Média: ${avg.toFixed(2)} (${matches.length} envios)` };
      }
      return { color: "bg-neutral-100 text-neutral-600", text: String(matches.length), title: `${matches.length} respostas` };
    }
    if (neg === 0) return { color: "bg-green-200 text-green-900", text: `${pos}✓`, title: `${pos} conforme(s)` };
    if (pos === 0) return { color: "bg-red-200 text-red-900", text: `${neg}✗`, title: `${neg} não conforme(s)` };
    return { color: "bg-amber-200 text-amber-900", text: `${pos}/${pos + neg}`, title: `${pos} sim, ${neg} não` };
  };

  if (days.length === 0) {
    return <p className="text-sm text-neutral-400">Sem dados para exibir.</p>;
  }

  return (
    <div className="border border-neutral-100 rounded-2xl bg-white p-4 overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: "4px" }}>
        <thead>
          <tr>
            <th className="text-left text-xs font-bold text-neutral-500 uppercase tracking-wide px-2 py-1 min-w-[160px]">
              Pergunta
            </th>
            {days.map((d) => (
              <th key={d} className="text-xs font-bold text-neutral-500 px-1 py-1 whitespace-nowrap">
                {format(new Date(d), "dd/MM", { locale: ptBR })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questionIds.map((qid: string) => (
            <tr key={qid}>
              <td className="text-xs text-neutral-700 font-medium px-2 py-1 truncate max-w-[180px]">
                {labelForBlock(qid)}
              </td>
              {days.map((d) => {
                const cell = cellFor(qid, d);
                return (
                  <td key={d} title={cell.title}>
                    <div
                      className={`w-12 h-9 rounded-md flex items-center justify-center text-[11px] font-bold ${cell.color}`}
                    >
                      {cell.text}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3 mt-4 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200" /> Conforme</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200" /> Não conforme</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200" /> Misto</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100" /> Média numérica</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-neutral-100" /> Sem dados</span>
      </div>
    </div>
  );
}