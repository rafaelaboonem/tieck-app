import { useCallback, useEffect, useRef, useState } from "react";
import { X, SwitchCamera, Zap, ZapOff, Images } from "lucide-react";
import { isRestrictedWebView, useCameraSession } from "@/contexts/CameraSessionContext";

type Props = {
  open: boolean;
  title: string;
  allowGallery?: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

/** Rótulos de "Qualidade da captura" — verificação 100% local, sem IA. */
type QualityHint = "low_light" | "too_bright" | "shaky" | "blurry" | "too_close" | "ready";

const HINT_LABEL: Record<QualityHint, string> = {
  low_light: "Mais luz",
  too_bright: "Menos luz",
  shaky: "Segure firme",
  blurry: "Segure firme",
  too_close: "Afaste um pouco",
  ready: "Pronto para fotografar",
};

function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem suporte */ }
}

/**
 * Câmera nativa do Tieck — fullscreen, mobile-first, premium.
 *
 * Nenhuma inferência de IA acontece enquanto a câmera está aberta: nenhum
 * frame sai do aparelho. A "Qualidade da captura" é calculada localmente a
 * partir de amostras 64x48 do próprio <video>.
 */
export function TieckCamera({ open, title, allowGallery = false, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const prevSampleRef = useRef<Float32Array | null>(null);

  const { stream, granted, denied, acquire, switchFacing } = useCameraSession();
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<QualityHint>("ready");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [flash, setFlash] = useState(false);

  // Só pede permissão depois de uma ação clara do usuário (abrir a câmera),
  // e reutiliza o stream da sessão nas próximas aberturas.
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

  // Reanexa o mesmo MediaStream ao elemento de vídeo — sem nova permissão.
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
    if (!open) { setReady(false); setHint("ready"); }
  }, [open]);

  /** Amostragem local — nunca sai do aparelho, nenhuma requisição de rede. */
  useEffect(() => {
    if (!open || !ready) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const luma = new Float32Array(canvas.width * canvas.height);
      let total = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        luma[p] = l;
        total += l;
      }
      const average = total / luma.length;

      let gradient = 0;
      for (let y = 1; y < canvas.height; y++) {
        for (let x = 1; x < canvas.width; x++) {
          const i = y * canvas.width + x;
          gradient += Math.abs(luma[i] - luma[i - 1]) + Math.abs(luma[i] - luma[i - canvas.width]);
        }
      }
      const sharpness = gradient / luma.length;

      let motion = 0;
      const prev = prevSampleRef.current;
      if (prev && prev.length === luma.length) {
        let diff = 0;
        for (let i = 0; i < luma.length; i++) diff += Math.abs(luma[i] - prev[i]);
        motion = diff / luma.length;
      }
      prevSampleRef.current = luma;

      const next: QualityHint =
        average < 28 ? "low_light"
          : average > 236 ? "too_bright"
            : motion > 26 ? "shaky"
              : sharpness < 1.1 ? "too_close"
                : sharpness < 2.2 ? "blurry"
                  : "ready";
      setHint(next);
    }, 600);

    return () => {
      clearInterval(id);
      prevSampleRef.current = null;
    };
  }, [open, ready]);

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
    if (!video || !video.videoWidth) return;
    haptic(18);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1920 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.9));
    if (!blob) return;
    // O stream permanece vivo: nenhuma nova permissão no próximo bloco.
    onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }, [onCapture]);

  if (!open) return null;

  const needsIntro = !granted && !denied;
  const showHint = ready && hint !== "ready";

  return (
    <div
      className="fixed inset-0 z-[100] bg-black text-white flex flex-col touch-none select-none overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Barra superior translúcida */}
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

        {/* Moldura-guia discreta */}
        {ready && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 aspect-[4/3] rounded-3xl border border-white/35 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)] transition-opacity duration-300" />
        )}

        {/* Feedback curto de qualidade, junto da moldura */}
        {showHint && (
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(50%-9rem)] rounded-full bg-black/65 backdrop-blur px-3 py-1.5 text-xs font-medium animate-in fade-in duration-200"
            aria-live="polite"
          >
            {HINT_LABEL[hint]}
          </div>
        )}

        {flash && <div className="absolute inset-0 bg-white/80 animate-out fade-out duration-150" />}

        {needsIntro && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-10 text-center bg-black/85">
            <p className="text-sm text-white/90">
              Vamos abrir a câmera para registrar esta evidência. Autorize o acesso quando o navegador pedir.
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
            {isRestrictedWebView() && (
              <p className="text-xs text-white/55">Para uma experiência melhor, abra no Safari.</p>
            )}
            <button type="button" onClick={onClose} className="text-xs text-white/60 underline">
              Voltar
            </button>
          </div>
        )}
      </div>

      {/* Controles inferiores */}
      <div className="relative z-20 flex items-center justify-between px-10 py-6 bg-gradient-to-t from-black/70 to-transparent">
        {allowGallery ? (
          <>
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
          </>
        ) : (
          <span className="w-11 h-11" />
        )}

        <button
          type="button"
          onClick={() => void shoot()}
          disabled={!ready}
          aria-label="Tirar foto"
          className="p-1 rounded-full bg-white/25 disabled:opacity-40 active:scale-95 transition"
          style={{ width: 76, height: 76 }}
        >
          <span className="block w-full h-full rounded-full bg-white" />
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
}
