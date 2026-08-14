import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { X, SwitchCamera, Zap, ZapOff, Images, Loader2 } from "lucide-react";
import { isRestrictedWebView, useCameraSession } from "@/contexts/CameraSessionContext";
import { QualityEngine } from "@/lib/camera-quality/engine";
import { CameraQualityResult, CameraQualityState } from "@/lib/camera-quality/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  allowGallery?: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

const HINT_LABEL: Record<CameraQualityState, string> = {
  initializing: "Iniciando...",
  ready: "Pronto para fotografar",
  low_light: "Ambiente com pouca luz",
  overexposed: "Reduza a luz direta",
  blurry: "Mantenha a câmera firme",
  moving: "Segure o aparelho por um instante",
  unavailable: "Câmera indisponível",
};

function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem suporte */ }
}

export function TieckCamera({ open, title, allowGallery = false, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const qualityEngineRef = useRef<QualityEngine | null>(null);
  const [qualityResult, setQualityResult] = useState<CameraQualityResult | null>(null);
  const [lastStates, setLastStates] = useState<CameraQualityState[]>([]);

  const { stream, granted, denied, acquire, switchFacing } = useCameraSession();
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [flash, setFlash] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void acquire().then((media) => {
      if (cancelled || !media) return;
      const track = media.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(Boolean(caps.torch));
    });
    return () => { cancelled = true; };
  }, [open, acquire]);

  useEffect(() => {
    const video = videoRef.current;
    if (!open || !video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => {});
    const onPlaying = () => setReady(true);
    video.addEventListener("playing", onPlaying);
    return () => video.removeEventListener("playing", onPlaying);
  }, [open, stream]);

  useEffect(() => {
    if (!open) { 
      setReady(false); 
      setQualityResult(null);
      setLastStates([]);
      if (qualityEngineRef.current) {
        qualityEngineRef.current.dispose();
        qualityEngineRef.current = null;
      }
    }
  }, [open]);

  // Local quality analysis
  useEffect(() => {
    if (!open || !ready || isCapturing) return;
    
    if (!qualityEngineRef.current) {
      qualityEngineRef.current = new QualityEngine();
    }

    const engine = qualityEngineRef.current;
    let timeoutId: number;
    let cancelled = false;

    const analyze = async () => {
      if (cancelled) return;

      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        try {
          const result = await engine.analyzeFrame(video);
          
          if (cancelled) return;

          setQualityResult(result);
          
          // Smooth transitions: keep track of last 2 states
          setLastStates(prev => {
            const next = [...prev, result.state].slice(-2);
            return next;
          });
        } catch (err) {
          console.error("[TieckCamera] Quality analysis error:", err);
        }
      }
      
      if (!cancelled) {
        timeoutId = window.setTimeout(analyze, 750);
      }
    };

    analyze();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [open, ready, isCapturing]);

  // Stabilized state for UI
  const stabilizedState = useMemo(() => {
    if (lastStates.length < 2) return "initializing";
    // Only change if both last states are the same
    if (lastStates[0] === lastStates[1]) return lastStates[0];
    return lastStates[0]; // Keep previous if they differ
  }, [lastStates]);

  const toggleTorch = useCallback(async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { setTorchAvailable(false); }
  }, [stream, torchOn]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || isCapturing) return;
    
    setIsCapturing(true);
    haptic(18);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1920 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.9));
    if (!blob) {
      setIsCapturing(false);
      return;
    }
    
    onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
    setIsCapturing(false);
  }, [onCapture, isCapturing]);

  if (!open) return null;

  const needsIntro = !granted && !denied;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black text-white flex flex-col touch-none select-none overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar câmera"
          className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
        <p className="flex-1 min-w-0 text-sm font-semibold truncate">{title}</p>
        {torchAvailable && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? "Desligar flash" : "Ligar flash"}
            className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition"
          >
            {torchOn ? <Zap className="w-5 h-5" aria-hidden /> : <ZapOff className="w-5 h-5" aria-hidden />}
          </button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />

        {/* Center frame guide */}
        {ready && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 aspect-[4/3] rounded-3xl border border-white/35 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)] transition-opacity duration-300" />
        )}

        {flash && <div className="absolute inset-0 bg-white/80 animate-out fade-out duration-150" />}

        {needsIntro && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-10 text-center bg-black/85">
            <p className="text-sm text-white/90">
              O Tieck precisa de acesso à câmera para registrar esta evidência.
            </p>
            <button
              type="button"
              onClick={() => void acquire()}
              className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold active:scale-95 transition"
            >
              Abrir câmera
            </button>
          </div>
        )}

        {denied && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-10 text-center bg-black/85">
            <p className="text-sm text-white/90">
              Não conseguimos acessar a câmera. Autorize o acesso nas configurações do navegador.
            </p>
            <button type="button" onClick={onClose} className="text-xs text-white/60 underline">
              Voltar
            </button>
          </div>
        )}
      </div>

      {/* Capture Quality Indicator */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30">
        <div className={cn(
          "px-4 py-2 rounded-full backdrop-blur-md text-xs font-bold transition-all duration-300 flex items-center gap-2",
          stabilizedState === 'ready' ? "bg-green-500/80 text-white" : 
          stabilizedState === 'initializing' ? "bg-white/20 text-white/70" : "bg-amber-500/80 text-white"
        )}>
          {stabilizedState === 'initializing' && <Loader2 className="w-3 h-3 animate-spin" />}
          {HINT_LABEL[stabilizedState]}
        </div>
      </div>

      {/* Lower controls */}
      <div className="relative z-20 flex items-center justify-between px-10 py-8 bg-gradient-to-t from-black/80 to-transparent">
        {allowGallery ? (
          <div className="w-11 h-11">
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              aria-label="Escolher da galeria"
              className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition"
            >
              <Images className="w-5 h-5" aria-hidden />
            </button>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onCapture(file);
              }}
            />
          </div>
        ) : (
          <div className="w-11 h-11" />
        )}

        <button
          type="button"
          onClick={() => void shoot()}
          disabled={!ready || isCapturing}
          aria-label="Tirar foto"
          className="p-1 rounded-full bg-white/25 disabled:opacity-40 active:scale-95 transition relative group"
          style={{ width: 80, height: 80 }}
        >
          <span className={cn(
            "block w-full h-full rounded-full transition-all duration-300",
            stabilizedState === 'ready' ? "bg-white shadow-[0_0_20px_rgba(255,255,255,0.5)]" : "bg-white/80"
          )} />
          {isCapturing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-black/20" />
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => { haptic(); void switchFacing(); }}
          aria-label="Trocar câmera"
          className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition"
        >
          <SwitchCamera className="w-5 h-5" aria-hidden />
        </button>
      </div>
    </div>
  );
  useEffect(() => {
    return () => {
      if (qualityEngineRef.current) {
        qualityEngineRef.current.dispose();
        qualityEngineRef.current = null;
      }
    };
  }, []);
}
