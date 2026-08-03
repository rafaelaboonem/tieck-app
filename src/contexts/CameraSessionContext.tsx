import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Sessão de câmera compartilhada pelo checklist público.
 *
 * Causa raiz da permissão repetida: cada bloco /Camera chamava
 * `getUserMedia()` ao abrir e encerrava TODAS as tracks ao fechar. Navegadores
 * que não persistem a concessão (WebView do WhatsApp, Safari em contexto
 * efêmero) reexibem o prompt a cada nova chamada. A correção é manter UM único
 * MediaStream vivo por sessão da página e reutilizá-lo em todos os blocos.
 *
 * Nada é gravado em localStorage: a autorização real continua sendo do
 * navegador. Aqui só existe o stream em memória.
 */

export type CameraFacing = "environment" | "user";

type CameraSession = {
  /** Stream ativo, ou null quando ainda não autorizado. */
  stream: MediaStream | null;
  /** true depois da primeira concessão nesta sessão de página. */
  granted: boolean;
  denied: boolean;
  facing: CameraFacing;
  /** Pede (ou reutiliza) o stream. Só deve ser chamado por ação do usuário. */
  acquire: (facing?: CameraFacing) => Promise<MediaStream | null>;
  /** Alterna câmera frontal/traseira reaproveitando a permissão já concedida. */
  switchFacing: () => Promise<MediaStream | null>;
  /** Encerra as tracks: envio do checklist, saída da página ou escolha do usuário. */
  release: () => void;
};

const Ctx = createContext<CameraSession | null>(null);

/** WebView interna do WhatsApp/Instagram: permissão não persiste entre aberturas. */
export function isRestrictedWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /WhatsApp|FBAN|FBAV|Instagram|Line\//i.test(ua);
}

export function CameraSessionProvider({ children }: { children: React.ReactNode }) {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [granted, setGranted] = useState(false);
  const [denied, setDenied] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const hiddenSince = useRef<number | null>(null);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const request = useCallback(async (next: CameraFacing): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = media;
      setStream(media);
      setFacing(next);
      setGranted(true);
      setDenied(false);
      return media;
    } catch {
      setDenied(true);
      return null;
    }
  }, []);

  const acquire = useCallback(
    async (next?: CameraFacing) => {
      const wanted = next ?? facing;
      const current = streamRef.current;
      // Reutiliza o mesmo stream: nenhuma nova chamada a getUserMedia.
      if (current && current.getVideoTracks().some((t) => t.readyState === "live") && wanted === facing) {
        return current;
      }
      return request(wanted);
    },
    [facing, request],
  );

  const switchFacing = useCallback(
    () => request(facing === "environment" ? "user" : "environment"),
    [facing, request],
  );

  // Encerra as tracks se a página ficar muito tempo em segundo plano (2 min)
  // e sempre que a página for descarregada.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince.current = Date.now();
      } else if (hiddenSince.current && Date.now() - hiddenSince.current > 120_000) {
        hiddenSince.current = null;
        release();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", release);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [release]);

  return (
    <Ctx.Provider value={{ stream, granted, denied, facing, acquire, switchFacing, release }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCameraSession(): CameraSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCameraSession requer CameraSessionProvider");
  return ctx;
}
