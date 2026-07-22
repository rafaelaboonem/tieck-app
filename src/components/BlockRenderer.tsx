import { useEffect, useRef, useState } from "react";
import { Star, Camera, Trash2, Upload } from "lucide-react";

export type BlockRenderMode = "preview" | "public";

/**
 * Thumbnail that forces a normalized aspect ratio:
 * - Portrait photos → 9:16
 * - Landscape photos → 16:9
 * - Squares → 1:1
 * Uses object-cover so the frame is consistent regardless of the device's native ratio (e.g. 3:4).
 */
function OrientedThumb({
  src,
  alt,
  heightClass = "h-12",
  className = "",
}: {
  src: string;
  alt: string;
  heightClass?: string;
  className?: string;
}) {
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "square">("portrait");
  const aspectClass =
    orientation === "landscape" ? "aspect-[16/9]" : orientation === "square" ? "aspect-square" : "aspect-[9/16]";
  return (
    <div className={`relative ${heightClass} ${aspectClass} overflow-hidden bg-neutral-100 ${className}`}>
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > img.naturalHeight) setOrientation("landscape");
          else if (img.naturalWidth < img.naturalHeight) setOrientation("portrait");
          else setOrientation("square");
        }}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

/** All block types that require a submit button (have user-input) */
export const INTERACTIVE_BLOCK_TYPES = [
  "short-answer", "long-answer", "multiple-choice", "checkboxes", "dropdown",
  "multi-select", "number", "email", "phone", "link", "file-upload", "date",
  "time", "linear-scale", "matrix", "rating", "signature", "ranking",
  "task-list", "counter", "currency", "audio", "qr-code", "camera",
];

// ───────────────── Internal helpers ─────────────────

function FileInputWithThumbnails({
  id, accept, capture, multiple, accentColor,
}: {
  id: string; accept: string; capture?: string; multiple?: boolean; accentColor: string;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setUrls((prev) => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };
  return (
    <div className="space-y-3">
      <input
        type="file" id={id} accept={accept} capture={capture as any} multiple={multiple}
        onChange={handleFileChange}
        className="w-full text-sm bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 dark:file:bg-neutral-700 file:px-3 file:py-1.5 file:text-sm file:font-medium transition-all"
        style={{ "--tw-ring-color": accentColor } as any}
      />
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
          {urls.slice(0, 3).map((url, i) => (
            <div key={i} className="relative inline-flex rounded-lg border border-neutral-200 overflow-hidden bg-white shadow-sm group">
              <OrientedThumb src={url} alt={`Captura ${i + 1}`} heightClass="h-14" />
              <button type="button" onClick={() => setUrls(urls.filter((_, idx) => idx !== i))}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
          {urls.length > 3 && (
            <div className="w-14 h-14 rounded-lg border border-neutral-200 bg-neutral-50 flex flex-col items-center justify-center shadow-sm">
              <span className="text-xs font-bold text-neutral-500">+{urls.length - 3}</span>
              <span className="text-[8px] text-neutral-400 uppercase font-bold">fotos</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CameraField({ value, onChange, textColor }: { value: any; onChange: (file: File | null) => void; textColor?: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [value]);
  const color = textColor || "#FF007F";
  return (
    <div className="w-full">
      <div
        onClick={() => inputRef.current?.click()}
        className={`relative w-full ${preview ? "h-20" : "h-16"} border rounded-lg bg-neutral-50/50 dark:bg-neutral-800/50 cursor-pointer transition-all flex items-center px-4 overflow-hidden group ${preview ? "" : "border-neutral-200 dark:border-neutral-700"}`}
        style={preview ? { borderColor: color } : undefined}
      >
        {preview ? (
          <div className="flex items-center gap-3 w-full">
            <div className="relative rounded-md overflow-hidden shrink-0 shadow-sm border bg-white inline-flex" style={{ borderColor: `${color}33` }}>
              <OrientedThumb src={preview} alt="Imagem capturada" heightClass="h-12" className="animate-in fade-in zoom-in-95 duration-300" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold tracking-wider" style={{ color }}>Imagem Capturada</span>
              <span className="text-[10px] text-neutral-400 truncate">Toque para alterar a imagem</span>
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
              <Camera className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center shrink-0 transition-colors">
              <Camera className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium" style={{ color }}>Capturar foto</span>
              <span className="text-[10px] text-neutral-400">Toque para abrir a câmera</span>
            </div>
          </div>
        )}
        <input
          ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

function CameraFieldMulti({
  value,
  onChange,
  textColor,
  max,
}: {
  value: any;
  onChange: (files: File[]) => void;
  textColor?: string;
  max: number;
}) {
  const files: File[] = Array.isArray(value) ? value.filter((f: any) => f instanceof File) : [];
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = textColor || "#FF007F";

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length]);

  const canAdd = files.length < max;

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    if (incoming.length === 0) return;
    const remaining = Math.max(0, max - files.length);
    const next = [...files, ...incoming.slice(0, remaining)];
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="w-full">
      <div
        onClick={() => canAdd && inputRef.current?.click()}
        className={`relative w-full ${files.length > 0 ? "h-20" : "h-16"} border rounded-lg transition-all flex items-center px-4 gap-3 overflow-hidden ${canAdd ? "cursor-pointer bg-neutral-50/50 dark:bg-neutral-800/50" : "cursor-not-allowed"} ${files.length > 0 ? "" : "border-neutral-200 dark:border-neutral-700"}`}
        style={
          !canAdd
            ? { borderColor: color, backgroundColor: `${color}14` }
            : files.length > 0
            ? { borderColor: color }
            : undefined
        }
      >
        {files.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 max-w-[55%] overflow-x-auto">
            {previews.map((url, i) => (
              <div
                key={i}
                className="relative rounded-md border overflow-hidden bg-white shadow-sm group shrink-0 inline-flex"
                style={{ borderColor: `${color}33` }}
              >
                <OrientedThumb src={url} alt={`Foto ${i + 1}`} heightClass="h-12" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  aria-label="Remover foto"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length === 0 && (
          <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center shrink-0">
            <Camera className="w-4 h-4" style={{ color }} />
          </div>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium truncate" style={{ color }}>
            {files.length === 0 ? "Capturar foto" : "Adicionar outra foto"}
          </span>
          <span className="text-[10px] text-neutral-400 truncate">
            {files.length}/{max} {files.length === 1 ? "foto" : "fotos"}
            {!canAdd && " — Concluído!"}
          </span>
        </div>
        {files.length > 0 && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
            <Camera className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleAdd}
      />
    </div>
  );
}

function FileUploadField({ value, onChange, textColor }: { value: any; onChange: (files: File[]) => void; textColor?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const color = textColor || "#FF007F";
  const files: File[] = Array.isArray(value) ? value.filter((f: any) => f instanceof File) : [];
  const hasFiles = files.length > 0;
  return (
    <div className="w-full">
      <div
        onClick={() => inputRef.current?.click()}
        className={`relative w-full ${hasFiles ? "h-20" : "h-16"} border rounded-lg bg-neutral-50/50 dark:bg-neutral-800/50 cursor-pointer transition-all flex items-center px-4 overflow-hidden group ${hasFiles ? "" : "border-neutral-200 dark:border-neutral-700"}`}
        style={hasFiles ? { borderColor: color } : undefined}
      >
        {hasFiles ? (
          <div className="flex items-center gap-3 w-full">
            <div className="relative w-12 h-12 rounded-md overflow-hidden shrink-0 shadow-sm border flex items-center justify-center bg-white dark:bg-neutral-800" style={{ borderColor: `${color}33` }}>
              <Upload className="w-5 h-5" style={{ color }} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold tracking-wider" style={{ color }}>
                {files.length} arquivo{files.length > 1 ? "s" : ""} selecionado{files.length > 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-neutral-400 truncate">
                {files.map((f) => f.name).join(", ")}
              </span>
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
              <Upload className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center shrink-0 transition-colors">
              <Upload className="w-4 h-4" style={{ color }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium" style={{ color }}>Selecionar arquivo</span>
              <span className="text-[10px] text-neutral-400">Toque para escolher do dispositivo</span>
            </div>
          </div>
        )}
        <input
          ref={inputRef} type="file" multiple className="hidden"
          onChange={(e) => onChange(Array.from(e.target.files || []))}
        />
      </div>
    </div>
  );
}

// ───────────────── Main renderer ─────────────────

export interface BlockRendererProps {
  block: any;
  settings: any;
  mode: BlockRenderMode;
  /** public mode only */
  answers?: Record<string, any>;
  /** public mode only */
  setAnswer?: (id: string, v: any) => void;
  /** public mode only — affects radio button style */
  isDark?: boolean;
}

/**
 * Renders a single checklist block. The SAME component is used by:
 *   - Editor preview (`mode="preview"`) — inputs are uncontrolled visual mocks
 *   - Public page (`mode="public"`) — inputs are controlled via `answers`/`setAnswer`
 *
 * Adding a new block type? Add ONE case here and both surfaces update.
 */
export function BlockRenderer({ block, settings, mode, answers = {}, setAnswer, isDark }: BlockRendererProps) {
  if (block.type === "image" && (block.variant === "profile" || block.variant === "cover")) return null;

  const accent = settings.accentColor || "#FF007F";
  const textColor = settings.textColor;
  const isPublic = mode === "public";
  const get = (id: string) => answers[id];
  const set = (id: string, v: any) => setAnswer?.(id, v);

  // Common input className/style
  const inputCls =
    "w-full bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 outline-none focus:ring-2 transition-all shadow-sm";
  const inputStyle = { "--tw-ring-color": accent } as any;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      {block.subtitle && (
        <p className="text-lg font-bold mb-2 whitespace-pre-wrap flex items-start gap-1" style={{ color: textColor }}>
          {block.subtitle}
          {block.required !== false && (
            <span className="text-lg font-bold text-[#FF007F] select-none" style={{ marginTop: "2px" }} title="Obrigatória">*</span>
          )}
        </p>
      )}

      {block.type === "text" && block.value && (() => {
        const content = block.value
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.*?)\*/g, "<em>$1</em>")
          .replace(/<u>(.*?)<\/u>/g, "<u>$1</u>");
        return (
          <p className="text-lg leading-relaxed opacity-90 whitespace-pre-wrap"
             style={{ color: textColor }} dangerouslySetInnerHTML={{ __html: content }} />
        );
      })()}

      {block.type === "heading-1" && <h1 className="text-3xl font-bold mt-10 mb-4" style={{ color: textColor }}>{block.value}</h1>}
      {block.type === "heading-2" && <h2 className="text-2xl font-bold mt-8 mb-3" style={{ color: textColor }}>{block.value}</h2>}
      {block.type === "heading-3" && <h3 className="text-xl font-bold mt-6 mb-2" style={{ color: textColor }}>{block.value}</h3>}
      {block.type === "divider" && <hr className="my-10 border-neutral-200 dark:border-neutral-800" />}

      {block.type === "short-answer" && (
        <input type="text" placeholder={block.placeholder || "Sua resposta"} className={inputCls} style={inputStyle}
          {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})} />
      )}

      {block.type === "long-answer" && (
        <textarea placeholder={block.placeholder || "Sua resposta longa"} rows={4}
          className={inputCls + " resize-none"} style={inputStyle}
          {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})} />
      )}

      {(block.type === "number" || block.type === "email" || block.type === "phone" || block.type === "link") && (
        <input
          type={block.type === "number" ? "number" : block.type === "email" ? "email" : block.type === "phone" ? "tel" : "url"}
          placeholder={
            block.placeholder ||
            (block.type === "number" ? "0" : block.type === "email" ? "voce@exemplo.com" : block.type === "phone" ? "(00) 00000-0000" : "https://")
          }
          className={inputCls} style={inputStyle}
          {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})}
        />
      )}

      {block.type === "currency" && (
        <div className="flex items-center w-full bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm focus-within:ring-2" style={inputStyle}>
          <span className="pl-4 pr-2 text-neutral-500 text-sm font-medium select-none">{block.currency || "R$"}</span>
          <input type="text" placeholder="0,00" className="flex-1 bg-transparent border-none outline-none px-2 py-3 text-sm" style={{ color: textColor }}
            {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})} />
        </div>
      )}

      {block.type === "counter" && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 shadow-sm w-fit">
          <button type="button" onClick={() => isPublic && set(block.id, Math.max(0, (get(block.id) ?? 0) - 1))}
            className="w-9 h-9 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center text-lg font-semibold">−</button>
          <span className="w-20 text-center text-lg font-semibold" style={{ color: textColor }}>
            {isPublic ? (get(block.id) ?? 0) : (block.value ?? 0)}
          </span>
          <button type="button" onClick={() => isPublic && set(block.id, (get(block.id) ?? 0) + 1)}
            className="w-9 h-9 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center text-lg font-semibold">+</button>
        </div>
      )}

      {block.type === "task-list" && (
        <div className="space-y-2">
          {block.options?.map((opt: any) => {
            const checked = isPublic ? (get(block.id) || []).includes(opt.value || opt.id) : !!opt.checked;
            return (
              <label key={opt.id} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-neutral-800/30 border border-neutral-100 dark:border-neutral-800 cursor-pointer shadow-sm">
                <input type="checkbox" className="w-4 h-4 rounded" style={{ accentColor: accent }} checked={checked}
                  onChange={(e) => {
                    if (!isPublic) return;
                    const v = opt.value || opt.id;
                    const prev: string[] = get(block.id) || [];
                    set(block.id, e.target.checked ? [...prev, v] : prev.filter((x) => x !== v));
                  }} />
                <span className="text-sm" style={{ color: textColor }}>{opt.value}</span>
              </label>
            );
          })}
        </div>
      )}

      {block.type === "audio" && (
        <div className="p-4 rounded-lg bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <input type="file" accept="audio/*" className="w-full text-sm"
            {...(isPublic ? { onChange: (e: any) => set(block.id, e.target.files?.[0] ?? null) } : {})} />
        </div>
      )}

      {block.type === "qr-code" && block.value && (
        <div className="flex justify-center p-4 rounded-lg bg-white border border-neutral-200 shadow-sm">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(block.value)}`} alt="QR Code" className="w-48 h-48" />
        </div>
      )}

      {block.type === "page-break" && (
        <hr className="my-10 border-neutral-200 dark:border-neutral-800" />
      )}

      {block.type === "checkboxes" && (
        <div className="space-y-3">
          {block.options?.map((opt: any) => {
            const v = opt.value || opt.id;
            const checked = isPublic ? (get(block.id) || []).includes(v) : false;
            return (
              <label key={opt.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-neutral-800/30 border border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 cursor-pointer transition-colors shadow-sm">
                <input type="checkbox" checked={checked}
                  onChange={(e) => {
                    if (!isPublic) return;
                    const prev: string[] = get(block.id) || [];
                    set(block.id, e.target.checked ? [...prev, v] : prev.filter((x: string) => x !== v));
                  }}
                  className="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600" style={{ accentColor: accent }} />
                <span className="text-sm font-medium" style={{ color: textColor }}>{opt.value}</span>
              </label>
            );
          })}
        </div>
      )}

      {block.type === "multiple-choice" && (
        <div className="space-y-3">
          {block.options?.map((opt: any, oi: number) => {
            const v = opt.value || opt.id;
            const isSelected = isPublic && get(block.id) === v;
            return (
              <label key={opt.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all shadow-sm ${
                  isSelected ? "bg-white dark:bg-neutral-800/50"
                             : "bg-white/50 dark:bg-neutral-800/30 border-neutral-100 dark:border-neutral-800 hover:border-neutral-200"
                }`}
                style={{ borderColor: isSelected ? accent : undefined }}>
                <input type="radio" name={block.id} checked={isSelected}
                  onChange={() => isPublic && set(block.id, v)} className="sr-only" />
                <div className="flex items-center justify-center w-6 h-6 rounded text-white text-xs font-semibold shrink-0 transition-colors"
                  style={{ backgroundColor: isSelected ? accent : (isDark ? "#404040" : accent) }}>
                  {String.fromCharCode(65 + oi)}
                </div>
                <span className="text-sm font-medium" style={{ color: textColor }}>{opt.value}</span>
              </label>
            );
          })}
        </div>
      )}

      {block.type === "dropdown" && (
        <select className={inputCls} style={inputStyle}
          {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})}>
          <option value="">Selecione uma opção</option>
          {block.options?.map((opt: any) => (
            <option key={opt.id} value={opt.value || opt.id}>{opt.value}</option>
          ))}
        </select>
      )}

      {block.type === "multi-select" && (
        <div className="flex flex-wrap gap-2">
          {block.options?.map((opt: any) => {
            const v = opt.value || opt.id;
            const selected = isPublic && (get(block.id) || []).includes(v);
            return (
              <button key={opt.id} type="button"
                onClick={() => {
                  if (!isPublic) return;
                  const prev: string[] = get(block.id) || [];
                  set(block.id, prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
                }}
                className="px-3 py-1.5 rounded-full border text-sm font-medium transition-colors"
                style={{
                  borderColor: selected ? accent : undefined,
                  backgroundColor: selected ? `${accent}1a` : undefined,
                  color: selected ? accent : textColor,
                }}>
                {opt.value}
              </button>
            );
          })}
        </div>
      )}

      {block.type === "rating" && (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = isPublic && (get(block.id) || 0) >= n;
            return (
              <Star key={n}
                onClick={() => isPublic && set(block.id, n)}
                className={`w-8 h-8 cursor-pointer transition-colors ${
                  active ? "text-yellow-400 fill-yellow-400" : "text-neutral-300 dark:text-neutral-700 hover:text-yellow-400"
                }`} />
            );
          })}
        </div>
      )}

      {block.type === "linear-scale" && (
        <div className="flex items-center justify-between gap-4 p-6 bg-white/50 dark:bg-neutral-800/30 rounded-xl border border-neutral-100 dark:border-neutral-800">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = isPublic && get(block.id) === n;
            return (
              <button key={n} type="button"
                onClick={() => isPublic && set(block.id, n)}
                className="w-10 h-10 rounded-full border flex items-center justify-center text-sm font-medium transition-colors"
                style={{
                  borderColor: selected ? accent : undefined,
                  backgroundColor: selected ? accent : undefined,
                  color: selected ? "#fff" : textColor,
                }}>
                {n}
              </button>
            );
          })}
        </div>
      )}

      {block.type === "matrix" && (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50">
              <tr>
                <th className="p-4 text-left border-b border-neutral-200 dark:border-neutral-700 font-medium"></th>
                {block.columns?.map((col: any) => (
                  <th key={col.id} className="p-4 text-center border-b border-neutral-200 dark:border-neutral-700 font-medium">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows?.map((row: any) => (
                <tr key={row.id}>
                  <td className="p-4 border-b border-neutral-100 dark:border-neutral-800 font-medium" style={{ color: textColor }}>{row.label}</td>
                  {block.columns?.map((col: any) => {
                    const matrixVal = isPublic ? (get(block.id) || {}) : {};
                    return (
                      <td key={col.id} className="p-4 border-b border-neutral-100 dark:border-neutral-800 text-center">
                        <input type="radio" name={`${block.id}-${row.id}`} style={{ accentColor: accent }}
                          checked={matrixVal[row.id] === col.id}
                          onChange={() => isPublic && set(block.id, { ...(get(block.id) || {}), [row.id]: col.id })} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {block.type === "ranking" && (
        <div className="space-y-2">
          {block.options?.map((opt: any, idx: number) => (
            <div key={opt.id} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
              <span className="text-sm" style={{ color: textColor }}>{opt.value}</span>
            </div>
          ))}
        </div>
      )}

      {block.type === "signature" && (
        <div className="w-full h-40 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900/50 flex items-center justify-center">
          <span className="text-sm text-neutral-400">Espaço para assinatura</span>
        </div>
      )}

      {block.type === "camera" && (
        isPublic ? (
          block.allowMultiple ? (
            <CameraFieldMulti
              value={get(block.id)}
              onChange={(files) => set(block.id, files)}
              textColor={textColor}
              max={Math.max(1, Math.min(20, block.maxPhotos ?? 5))}
            />
          ) : (
            <CameraField value={get(block.id)} onChange={(f) => set(block.id, f)} textColor={textColor} />
          )
        ) : (
          <FileInputWithThumbnails id={block.id} accept="image/*" capture="environment" multiple accentColor={accent} />
        )
      )}

      {block.type === "date" && (
        <input type="date"
          min={`${new Date().getFullYear()}-01-01`} max={`${new Date().getFullYear()}-12-31`}
          className={inputCls} style={inputStyle}
          {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})} />
      )}

      {block.type === "time" && (
        <input type="time" className={inputCls} style={inputStyle}
          {...(isPublic ? { value: get(block.id) ?? "", onChange: (e: any) => set(block.id, e.target.value) } : {})} />
      )}

      {block.type === "observation" && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 rounded-r-lg">
          <p className="text-sm text-amber-900 dark:text-amber-200 italic">{block.value || "Observação"}</p>
        </div>
      )}

      {block.type === "label" && (
        <span className="inline-block px-3 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs font-bold uppercase tracking-wider text-neutral-500">{block.value || "Rótulo"}</span>
      )}

      {block.type === "image" && !block.variant && (
        <input type="file" accept="image/*"
          className="w-full text-sm bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 dark:file:bg-neutral-700 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          {...(isPublic ? { onChange: (e: any) => set(block.id, e.target.files?.[0] ?? null) } : {})} />
      )}

      {block.type === "file-upload" && (
        isPublic ? (
          <FileUploadField value={get(block.id)} onChange={(files) => set(block.id, files)} textColor={accent} />
        ) : (
          <FileUploadField value={null} onChange={() => {}} textColor={accent} />
        )
      )}

      {block.type === "video" && block.src && (
        <div className="aspect-video w-full rounded-xl overflow-hidden border border-neutral-100 dark:border-neutral-800 shadow-md bg-black">
          {(block.src.includes("youtube.com") || block.src.includes("vimeo.com")) ? (
            <iframe src={block.src} className="w-full h-full" allowFullScreen />
          ) : (
            <video src={block.src} controls className="w-full h-full" />
          )}
        </div>
      )}

      {block.type === "embed" && block.src && (
        <iframe src={block.src} className="w-full h-[480px] rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-md" />
      )}
    </div>
  );
}