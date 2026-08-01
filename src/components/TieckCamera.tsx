import { useCallback, useEffect, useRef, useState } from "react";
import { X, RefreshCw, Camera as CameraIcon } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  onCapture: (file: File) => void;
};

/**
 * Câmera nativa do Tieck: fullscreen, mobile-first.
 *
 * Camera V2 — nenhuma inferência de IA acontece enquanto a câmera está aberta:
 * nenhum frame é enviado a provedor algum, não há polling, badge de análise,
 * bounding box ou orientação "inteligente". A única verificação é local, feita
 * DEPOIS da captura.
 */
export function TieckCamera({ open, title, hint, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setDenied(false);
        setReady(true);
      } catch {
        if (!cancelled) {
          setDenied(true);
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1920 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
      );
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      onCapture(file);
    } finally {
      setCapturing(false);
    }
  }, [onCapture, stopStream]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-3 px-4 py-3 text-white/90">
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          aria-label="Fechar câmera"
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
        <p className="flex-1 min-w-0 text-sm font-semibold truncate">{title}</p>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Guias estáticas de composição — não representam análise de IA. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[82%] aspect-square max-h-[70%] border-2 border-white/40 rounded-3xl" />
        </div>

        <p className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[90%] text-center text-xs text-white/90 bg-black/50 rounded-full px-3 py-1.5">
          Posicione o item solicitado e tire a foto.
        </p>

        {hint && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90%] text-center text-xs text-white/80 bg-black/50 rounded-full px-3 py-1.5">
            {hint}
          </p>
        )}

        {denied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center bg-black/80">
            <p className="text-sm text-white/90">
              Não conseguimos acessar a câmera. Permita o acesso ou use a câmera do dispositivo.
            </p>
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-sm font-semibold"
            >
              <CameraIcon className="w-4 h-4" aria-hidden />
              Abrir câmera do dispositivo
            </button>
            <button type="button" onClick={onClose} className="text-xs text-white/60 underline">
              Cancelar
            </button>
            <input
              ref={fallbackInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onCapture(file);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-8 py-6">
        <button
          type="button"
          onClick={() => {
            stopStream();
            setDenied(false);
            setReady(false);
            setTimeout(() => videoRef.current?.play().catch(() => {}), 0);
          }}
          aria-label="Reiniciar câmera"
          className="w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
        >
          <RefreshCw className="w-5 h-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={shoot}
          disabled={!ready || capturing}
          aria-label="Tirar foto"
          className="w-18 h-18 p-1 rounded-full bg-white/25 disabled:opacity-40"
          style={{ width: 72, height: 72 }}
        >
          <span className="block w-full h-full rounded-full bg-white" />
        </button>
        <span className="w-11 h-11" />
      </div>
    </div>
  );
}
