import { LucideIcon, Camera, X, SwitchCamera, Zap, ZapOff, Images, CheckCircle2, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCameraSession } from "@/contexts/CameraSessionContext";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";

interface PublicCameraV5Props {
  block: any;
  checklistId: string;
  accentColor?: string;
  textColor?: string;
  title?: string;
  onAnswer?: (blockId: string, value: string) => void;
  onCameraActiveChange?: (active: boolean) => void;
  session?: { responseId: string; responseToken: string } | null;
  ensureResponseSession: () => Promise<{ responseId: string; responseToken: string } | null>;
  language?: string;
}

type QualityHint = "low_light" | "too_bright" | "shaky" | "blurry" | "too_close" | "ready";

const HINT_LABEL: Record<string, Record<QualityHint, string>> = {
  pt: {
    low_light: "Mais luz",
    too_bright: "Menos luz",
    shaky: "Segure firme",
    blurry: "Segure firme",
    too_close: "Afaste um pouco",
    ready: "Pronto",
  },
  en: {
    low_light: "More light",
    too_bright: "Less light",
    shaky: "Hold steady",
    blurry: "Hold steady",
    too_close: "Move away",
    ready: "Ready",
  }
};

function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch {}
}

export function PublicCameraV5({
  block,
  checklistId,
  accentColor,
  textColor,
  title,
  onAnswer,
  onCameraActiveChange,
  session,
  ensureResponseSession,
  language = "pt"
}: PublicCameraV5Props) {
  const [phase, setPhase] = useState<"idle" | "capturing" | "reviewing" | "uploading" | "received" | "error">("idle");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const prevSampleRef = useRef<Float32Array | null>(null);
  const { stream, granted, denied, acquire, switchFacing } = useCameraSession();
  
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<QualityHint>("ready");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [flash, setFlash] = useState(false);

  const lang = language.startsWith("en") ? "en" : "pt";

  // Camera Logic
  useEffect(() => {
    if (phase !== "capturing") return;
    let cancelled = false;
    acquire().then((media) => {
      if (cancelled || !media) return;
      const track = media.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as any;
      setTorchAvailable(Boolean(caps.torch));
    });
    return () => { cancelled = true; };
  }, [phase, acquire]);

  useEffect(() => {
    const video = videoRef.current;
    if (phase !== "capturing" || !video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {});
    const onPlaying = () => setReady(true);
    video.addEventListener("playing", onPlaying);
    return () => video.removeEventListener("playing", onPlaying);
  }, [phase, stream]);

  // Quality checks (local)
  useEffect(() => {
    if (phase !== "capturing" || !ready) return;
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
  }, [phase, ready]);

  const shoot = async () => {
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
    const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase("reviewing");
    onCameraActiveChange?.(false);
  };

  const handleUpload = async () => {
    if (!capturedFile) return;
    setPhase("uploading");
    
    try {
      const active = session ?? (await ensureResponseSession());
      if (!active) {
        setErrorMsg("Falha ao iniciar sessão.");
        setPhase("error");
        return;
      }

      // Reutiliza a lógica de compressão e upload do Supabase aqui ou importa de um util
      // Por simplicidade na Fase 1, simulamos o sucesso após upload para o bucket
      // (Na implementação real, chamaria a função de upload existente)
      
      // Simulação do upload existente:
      const { supabase } = await import("@/integrations/supabase/client");
      const { compressImage } = await import("@/lib/compress-image");
      
      let fileToUpload = capturedFile;
      if (capturedFile.size > 400_000) {
        const compressed = await compressImage(capturedFile);
        if (compressed) fileToUpload = compressed;
      }

      const ext = fileToUpload.type.split("/")[1] || "jpg";
      const path = `responses/${checklistId}/${crypto.randomUUID()}.${ext}`;
      
      const { error: upErr } = await supabase.storage
        .from("checklist-assets")
        .upload(path, fileToUpload);
      
      if (upErr) throw upErr;

      const { data: publicUrl } = supabase.storage.from("checklist-assets").getPublicUrl(path);
      
      onAnswer?.(block.id, publicUrl.publicUrl);
      setPhase("received");
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro ao enviar foto.");
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setCapturedFile(null);
    setPreviewUrl(null);
    setErrorMsg(null);
    onCameraActiveChange?.(false);
  };

  const startCapture = () => {
    setPhase("capturing");
    onCameraActiveChange?.(true);
  };

  // UI Fullscreen Camera
  if (phase === "capturing") {
    return (
      <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col touch-none select-none"
           style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent"
             style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
          <button onClick={reset} className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          <p className="flex-1 text-sm font-semibold truncate">{title || "Câmera"}</p>
          {torchAvailable && (
            <button onClick={() => {
              const track = stream?.getVideoTracks()[0];
              if (track) {
                const next = !torchOn;
                track.applyConstraints({ advanced: [{ torch: next } as any] }).then(() => setTorchOn(next));
              }
            }} className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
              {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}
        </div>
        <div className="relative flex-1 overflow-hidden">
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
          {ready && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 aspect-[4/3] rounded-3xl border border-white/35 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
          )}
          {hint !== "ready" && ready && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(50%-9rem)] rounded-full bg-black/65 backdrop-blur px-3 py-1.5 text-xs font-medium">
              {HINT_LABEL[lang][hint]}
            </div>
          )}
          {flash && <div className="absolute inset-0 bg-white/80 animate-out fade-out duration-150" />}
        </div>
        <div className="relative z-20 flex items-center justify-between px-10 py-6 bg-gradient-to-t from-black/70 to-transparent">
          <button onClick={() => galleryRef.current?.click()} className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
            <Images className="w-5 h-5" />
          </button>
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCapturedFile(file);
              setPreviewUrl(URL.createObjectURL(file));
              setPhase("reviewing");
              onCameraActiveChange?.(false);
            }
          }} />
          <button onClick={shoot} disabled={!ready} className="p-1 rounded-full bg-white/25 w-[76px] h-[76px]">
            <span className="block w-full h-full rounded-full bg-white" />
          </button>
          <button onClick={() => { haptic(); switchFacing(); }} className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
            <SwitchCamera className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Review / Confirm UI
  if (phase === "reviewing" && previewUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="flex-1 relative bg-neutral-900 flex items-center justify-center">
          <img src={previewUrl} alt="Review" className="max-w-full max-h-full object-contain" />
        </div>
        <div className="p-6 bg-black flex flex-col gap-4">
          <Button onClick={handleUpload} className="w-full h-14 text-lg font-bold" style={{ backgroundColor: accentColor }}>
            Usar esta foto
          </Button>
          <Button variant="ghost" onClick={() => setPhase("capturing")} className="text-white hover:bg-white/10">
            Tirar outra foto
          </Button>
        </div>
      </div>
    );
  }

  // Standard inline UI
  return (
    <div className="w-full space-y-3">
      {phase === "idle" && (
        <Button
          variant="outline"
          className="w-full h-16 border-dashed flex items-center justify-center gap-2"
          onClick={startCapture}
          style={{ borderColor: accentColor, color: textColor }}
        >
          <Camera className="w-5 h-5" />
          <span>{title || "Adicionar foto"}</span>
        </Button>
      )}

      {phase === "uploading" && (
        <div className="flex items-center gap-3 p-4 border rounded-xl bg-white shadow-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Enviando foto...</span>
        </div>
      )}

      {phase === "received" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 border rounded-xl bg-blue-50 border-blue-100 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-blue-900">Foto recebida</span>
                <span className="text-[10px] text-blue-700 font-medium">A verificação inteligente ainda não está ativada.</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={startCapture} className="text-blue-700 hover:bg-blue-100">
              <RefreshCw className="w-4 h-4 mr-2" />
              Trocar
            </Button>
          </div>
          {previewUrl && (
            <div className="relative aspect-video rounded-xl overflow-hidden border">
              <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      )}

      {phase === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <span>{errorMsg || "Erro técnico."}</span>
            <Button variant="ghost" size="sm" onClick={startCapture} className="h-auto p-0 underline">
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
