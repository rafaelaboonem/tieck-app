import { useEffect, useState } from "react";
import { getEvidenceSignedUrl } from "@/lib/evidence-signed-url";

interface Props {
  path: string;
  alt: string;
  className?: string;
  onOpen?: (url: string) => void;
}

export function EvidenceThumb({ path, alt, className, onOpen }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getEvidenceSignedUrl(path).then((u) => {
      if (cancelled) return;
      if (!u) {
        setStatus("error");
        return;
      }
      setUrl(u);
      setStatus("ok");
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (status === "loading")
    return (
      <div
        className={`bg-neutral-100 animate-pulse rounded ${className ?? "w-20 h-20"}`}
        aria-label="Carregando evidência"
      />
    );
  if (status === "error" || !url)
    return (
      <div
        className={`bg-neutral-100 text-neutral-400 rounded flex items-center justify-center text-[10px] ${className ?? "w-20 h-20"}`}
      >
        indisponível
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => onOpen?.(url)}
      className={`overflow-hidden rounded border border-neutral-200 hover:border-neutral-300 ${className ?? "w-20 h-20"}`}
    >
      <img src={url} alt={alt} loading="lazy" className="w-full h-full object-cover" />
    </button>
  );
}