import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, SwitchCamera, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";
import {
  liveLocate,
  runBenchmark,
  referenceBase64,
  startLabSession,
  createLabAttempt,
  LIVE_MIN_INTERVAL_MS,
  type LabResponse,
  type LiveStats,
  type LocateResult,
  type StandardProfile,
  type UsageTotals,
} from "@/lib/visual-standards";

type Phase = "starting" | "live" | "captured" | "result";

type CameraStatus =
  | "starting"
  | "searching"
  | "checking"
  | "found"
  | "adjust"
  | "ready"
  | "blocked";

export interface CameraV3Result {
  response: LabResponse;
  live: LiveStats;
}

interface Props {
  open: boolean;
  workspaceId: string;
  question: string;
  profile: StandardProfile | null;
  standardId: string | null;
  referencePath: string | null;
  useReference: boolean;
  onClose: () => void;
  onResult: (result: CameraV3Result) => void;
}

interface LocalQuality {
  luma: number;
  dark: boolean;
  overexposed: boolean;
  blurry: boolean;
  moving: boolean;
  lowRes: boolean;
}

const IDLE_INTERVAL_MS = 2200;
const STABLE_INTERVAL_MS = 1000;
const FRAME_WIDTH = 512;

const STATUS_LABEL: Record<CameraStatus, string> = {
  starting: "Iniciando câmera",
  searching: "Procurando o objeto",
  checking: "IA verificando",
  found: "Objeto encontrado",
  adjust: "Ajuste necessário",
  ready: "Pronto para fotografar",
  blocked: "Ajuste necessário",
};

const TONE: Record<CameraStatus, string> = {
  starting: "bg-white/15 text-white",
  searching: "bg-white/15 text-white",
  checking: "bg-white/15 text-white",
  found: "bg-amber-400/90 text-black",
  adjust: "bg-amber-400/90 text-black",
  ready: "bg-emerald-500/90 text-white",
  blocked: "bg-red-500/90 text-white",
};

export function CameraV3Preview(props: Props) {
  const { open, workspaceId, question, profile, standardId, referencePath, useReference, onClose, onResult } = props;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevSampleRef = useRef<Uint8ClampedArray | null>(null);
  const liveBusyRef = useRef(false);
  const liveSeqRef = useRef(0);
  const openedAtRef = useRef<number>(0);
  const statsRef = useRef({
    checks: 0,
    latencySum: 0,
    firstFoundAt: null as number | null,
    strategy: "none" as LiveStats["strategy"],
    localChecks: 0,
    neurons: 0,
    inputTokens: 0,
    outputTokens: 0,
    aiCalls: 0,
  });
  const closedRef = useRef(false);
  const sessionIdRef = useRef<string>("");
  const lastLiveAtRef = useRef(0);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [phase, setPhase] = useState<Phase>("starting");
  const [denied, setDenied] = useState(false);
  const [quality, setQuality] = useState<LocalQuality>({
    luma: 128, dark: false, overexposed: false, blurry: false, moving: false, lowRes: false,
  });
  const [locate, setLocate] = useState<LocateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [result, setResult] = useState<LabResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveBudget, setLiveBudget] = useState<{ used: number; remaining: number } | null>(null);
  const [attempts, setAttempts] = useState<{ used: number; limit: number | null } | null>(null);

  const addUsage = useCallback((usage: UsageTotals | undefined) => {
    if (!usage) return;
    const s = statsRef.current;
    s.neurons += usage.neurons ?? 0;
    s.inputTokens += usage.inputTokens ?? 0;
    s.outputTokens += usage.outputTokens ?? 0;
    s.aiCalls += usage.calls ?? 0;
  }, []);

  const target = profile?.target_phrase_en?.trim() || "";
  const targetPt = profile?.target_phrase?.trim() || "o item";

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeAll = useCallback(() => {
    closedRef.current = true;
    liveSeqRef.current++;
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  // ---- abertura da câmera ----
  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    closedRef.current = false;
    openedAtRef.current = Date.now();
    statsRef.current = {
      checks: 0, latencySum: 0, firstFoundAt: null, strategy: "none",
      localChecks: 0, neurons: 0, inputTokens: 0, outputTokens: 0, aiCalls: 0,
    };
    sessionIdRef.current = "";
    lastLiveAtRef.current = 0;
    setLiveBudget(null);
    setAttempts(null);
    setPhase("starting");
    setResult(null);
    setFrozen(null);
    setLocate(null);
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        // A sessão (e o orçamento de IA) é emitida pelo servidor, nunca pelo cliente.
        const session = await startLabSession(workspaceId, standardId);
        if (cancelled) return;
        if (!session.ok) {
          setError(session.message ?? "Limite de sessões atingido. Tente novamente mais tarde.");
          return;
        }
        sessionIdRef.current = session.sessionId;
        setLiveBudget({ used: session.liveUsed, remaining: Math.max(0, session.liveLimit - session.liveUsed) });
        setAttempts({ used: session.attemptsUsed, limit: session.attemptsLimit });
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setDenied(false);
        setPhase("live");
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facing, stopStream, workspaceId, standardId]);

  // encerra tracks ao sair da página
  useEffect(() => {
    if (!open) return;
    const onHide = () => { if (document.visibilityState === "hidden") stopStream(); };
    window.addEventListener("pagehide", stopStream);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", stopStream);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [open, stopStream]);

  // ---- análise local contínua ----
  const sampleFrame = useCallback((): LocalQuality | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const w = 64;
    const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;

    let sum = 0, bright = 0;
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
      const l = px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
      gray[p] = l;
      sum += l;
      if (l > 246) bright++;
    }
    const luma = sum / (w * h);

    // nitidez: variância do gradiente
    let gsum = 0, gsum2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const g = Math.abs(gray[i] * 4 - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]);
        gsum += g; gsum2 += g * g; n++;
      }
    }
    const variance = n ? gsum2 / n - (gsum / n) ** 2 : 0;

    // movimento: diferença média com o frame anterior
    let motion = 0;
    const prev = prevSampleRef.current;
    if (prev && prev.length === px.length) {
      let diff = 0;
      for (let i = 0; i < px.length; i += 16) diff += Math.abs(px[i] - prev[i]);
      motion = diff / (px.length / 16);
    }
    prevSampleRef.current = px;

    return {
      luma,
      dark: luma < 45,
      overexposed: luma > 235 || bright / (w * h) > 0.5,
      blurry: variance < 45,
      moving: motion > 18,
      lowRes: video.videoWidth < 640,
    };
  }, []);

  useEffect(() => {
    if (!open || phase !== "live") return;
    const id = setInterval(() => {
      const q = sampleFrame();
      if (q) {
        statsRef.current.localChecks++;
        setQuality(q);
      }
    }, 200);
    return () => clearInterval(id);
  }, [open, phase, sampleFrame]);

  const grabDataUrl = useCallback((maxWidth: number, quality: number): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  // ---- localização remota: só por evento (cena estável e com qualidade) ----
  const liveExhausted = liveBudget !== null && liveBudget.remaining <= 0;

  useEffect(() => {
    if (!open || phase !== "live" || !target || !standardId) return;
    if (liveExhausted) return;
    let stopped = false;
    let timer: number | undefined;

    const tick = async () => {
      if (stopped || closedRef.current) return;
      const sinceLast = Date.now() - lastLiveAtRef.current;
      const stable = !quality.moving && !quality.dark && !quality.overexposed && !quality.blurry;
      if (!sessionIdRef.current || liveBusyRef.current || !stable || sinceLast < LIVE_MIN_INTERVAL_MS) {
        timer = window.setTimeout(tick, IDLE_INTERVAL_MS);
        return;
      }
      const frame = grabDataUrl(FRAME_WIDTH, 0.6);
      if (!frame) { timer = window.setTimeout(tick, IDLE_INTERVAL_MS); return; }
      liveBusyRef.current = true;
      lastLiveAtRef.current = Date.now();
      const seq = ++liveSeqRef.current;
      setChecking(true);
      const started = Date.now();
      try {
        const res = await liveLocate({
          workspaceId,
          standardId,
          frameBase64: frame,
          requestId: `${seq}`,
          sessionId: sessionIdRef.current,
        });
        if (stopped || closedRef.current || seq !== liveSeqRef.current) return;
        // Descarta respostas fora de ordem.
        if (res.requestId && res.requestId !== `${seq}`) return;
        if (res.budget) setLiveBudget({ used: res.budget.used, remaining: res.budget.remaining });
        addUsage(res.usage);
        if (res.budget && !res.budget.spent) {
          // servidor recusou (cooldown ou limite): mantém orientação local.
          return;
        }
        statsRef.current.checks++;
        statsRef.current.latencySum += Date.now() - started;
        statsRef.current.strategy = res.strategy;
        if (res.found && statsRef.current.firstFoundAt === null) {
          statsRef.current.firstFoundAt = Date.now();
        }
        setLocate(res);
      } catch {
        /* orientação é best-effort */
      } finally {
        liveBusyRef.current = false;
        if (!stopped) setChecking(false);
        if (!stopped && !closedRef.current) timer = window.setTimeout(tick, STABLE_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(tick, 400);
    return () => {
      stopped = true;
      liveSeqRef.current++;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, phase, target, standardId, workspaceId, grabDataUrl, addUsage, liveExhausted, quality.moving, quality.dark, quality.overexposed, quality.blurry]);

  // ---- estado + orientação (decididos no servidor) ----
  const box = locate?.boxes?.[0] ?? null;
  let status: CameraStatus = "searching";
  let guidance = `Aponte a câmera para ${targetPt}.`;

  if (phase === "starting") { status = "starting"; guidance = "Preparando a câmera…"; }
  else if (quality.dark) { status = "blocked"; guidance = "Melhore a iluminação."; }
  else if (quality.overexposed) { status = "blocked"; guidance = "Reduza o brilho ou o reflexo."; }
  else if (quality.moving) { status = "adjust"; guidance = "Mantenha o celular firme."; }
  else if (quality.blurry) { status = "adjust"; guidance = "Aguarde o foco da câmera."; }
  else if (!target) { status = "found"; guidance = "Enquadre o item e tire a foto."; }
  else if (!locate) { status = checking ? "checking" : "searching"; }
  else if (locate.state === "ready") { status = "ready"; guidance = locate.hint; }
  else if (locate.state === "adjust") { status = "adjust"; guidance = locate.hint; }
  else if (locate.state === "uncertain") { status = "checking"; guidance = locate.hint; }
  else { status = "searching"; guidance = locate.found ? locate.hint : `Aponte a câmera para ${targetPt}.`; }


  // ---- captura e decisão ----
  const capture = async () => {
    const full = grabDataUrl(1920, 0.9);
    if (!full) return;
    liveSeqRef.current++;
    setFrozen(full);
    setPhase("captured");
    stopStream();
    setError(null);
    try {
      let ref: string | null = null;
      if (useReference && referencePath) ref = await referenceBase64(referencePath);
      if (!sessionIdRef.current) throw new Error("session_missing");
      // Uma tentativa por foto: o servidor registra e conta a decisão final.
      const attempt = await createLabAttempt(workspaceId, sessionIdRef.current);
      if (!attempt.ok || !attempt.attemptId) {
        setAttempts((a) => ({ used: attempt.attemptsUsed, limit: a?.limit ?? null }));
        throw new Error(attempt.reason === "attempt_limit_reached" ? "attempt_limit" : "attempt_failed");
      }
      setAttempts((a) => ({ used: attempt.attemptsUsed, limit: attempt.attemptsLimit ?? a?.limit ?? null }));
      const res = await runBenchmark({
        workspaceId,
        question,
        imageBase64: full,
        referenceBase64: ref,
        standardId,
        profile,
        sessionId: sessionIdRef.current,
        attemptId: attempt.attemptId,
      });
      addUsage(res.usage);
      const s = statsRef.current;
      setResult(res);
      setPhase("result");
      onResult({
        response: res,
        live: {
          timeToTargetMs: s.firstFoundAt ? s.firstFoundAt - openedAtRef.current : null,
          liveChecks: s.checks,
          avgLiveLatencyMs: s.checks ? Math.round(s.latencySum / s.checks) : null,
          strategy: s.strategy,
          neurons: Math.round(s.neurons * 1000) / 1000,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          aiCalls: s.aiCalls,
          localChecks: s.localChecks,
        },
      });
    } catch {
      setError("Não foi possível verificar agora.");
      setPhase("result");
    }
  };

  const retry = () => {
    setResult(null);
    setFrozen(null);
    setError(null);
    setLocate(null);
    setPhase("starting");
    // reabre o stream
    setFacing((f) => f);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase("live");
      } catch {
        setDenied(true);
      }
    })();
  };

  if (!open) return null;

  // mapeamento da bbox para o vídeo com object-cover
  let boxStyle: React.CSSProperties | null = null;
  const video = videoRef.current;
  const wrap = wrapRef.current;
  if (box && video?.videoWidth && wrap) {
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
    const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    boxStyle = {
      left: ox + box.x * dw,
      top: oy + box.y * dh,
      width: box.w * dw,
      height: box.h * dh,
    };
  }

  const decision = result?.combined.decision;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Prévia da câmera">
      {/* topo */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={closeAll}
          aria-label="Fechar câmera"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{question}</p>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${TONE[status]}`} aria-live="polite">
          {phase === "captured" ? "Verificando foto" : STATUS_LABEL[status]}
        </span>
      </div>

      {/* área da câmera */}
      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        {frozen ? (
          <img src={frozen} alt="Foto capturada" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
        )}

        {phase === "live" && (
          <>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-6 top-6 h-8 w-8 border-l-2 border-t-2 border-white/50" />
              <div className="absolute right-6 top-6 h-8 w-8 border-r-2 border-t-2 border-white/50" />
              <div className="absolute bottom-6 left-6 h-8 w-8 border-b-2 border-l-2 border-white/50" />
              <div className="absolute bottom-6 right-6 h-8 w-8 border-b-2 border-r-2 border-white/50" />
            </div>
            {boxStyle && (
              <div
                className={`pointer-events-none absolute rounded-xl border-2 transition-all duration-200 ${
                  status === "ready" ? "border-emerald-400" : "border-amber-300"
                }`}
                style={boxStyle}
              />
            )}
            {checking && (
              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> verificando
              </div>
            )}
          </>
        )}

        {phase === "captured" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
            <p className="text-sm">Verificando foto…</p>
          </div>
        )}

        {phase === "result" && (
          <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black via-black/85 to-transparent p-5 text-white">
            {error ? (
              <>
                <p className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="h-5 w-5" aria-hidden /> Não foi possível verificar agora.</p>
                <p className="text-sm text-white/80">Tente novamente em instantes.</p>
              </>
            ) : decision === "approved" ? (
              <>
                <p className="flex items-center gap-2 text-base font-semibold text-emerald-400"><CheckCircle2 className="h-5 w-5" aria-hidden /> Foto aprovada</p>
                <p className="text-sm text-white/85">{result?.combined.public_message}</p>
              </>
            ) : decision === "uncertain" ? (
              <>
                <p className="text-base font-semibold text-sky-300">
                  {result?.combined.condition_status === "not_observable"
                    ? "Não dá para confirmar por foto"
                    : "Tire outra foto"}
                </p>
                <p className="text-sm text-white/85">
                  {result?.combined.public_message ??
                    "Não deu para confirmar. Melhore o enquadramento e tente de novo."}
                </p>
              </>
            ) : decision === "technical_failure" ? (
              <>
                <p className="text-base font-semibold text-rose-300">Não foi possível verificar agora.</p>
                <p className="text-sm text-white/85">
                  {result?.combined.reason_code === "session_limit_reached"
                    ? result.combined.public_message
                    : "Tente novamente."}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-amber-300">Tire outra foto</p>
                <p className="text-sm text-white/85">{result?.combined.public_message}</p>
              </>
            )}

            <div className="flex gap-3 pt-1">
              {decision === "approved" && !error ? (
                <button
                  type="button"
                  onClick={closeAll}
                  className="flex-1 rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white"
                >
                  Usar esta foto
                </button>
              ) : (
                <button
                  type="button"
                  onClick={retry}
                  className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-semibold text-black"
                >
                  <RefreshCcw className="mr-2 inline h-4 w-4" aria-hidden /> Tentar novamente
                </button>
              )}
              <button type="button" onClick={closeAll} className="rounded-full bg-white/15 px-4 py-3 text-sm text-white">
                Fechar
              </button>
            </div>
          </div>
        )}

        {denied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-8 text-center text-white">
            <p className="text-sm">Não conseguimos acessar a câmera deste dispositivo.</p>
            <button type="button" onClick={closeAll} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
              Fechar
            </button>
          </div>
        )}
      </div>

      {/* rodapé */}
      {phase === "live" && (
        <div className="space-y-3 px-5 pb-6 pt-3">
          <p className="text-center text-sm font-medium text-white">{guidance}</p>
          <p className="text-center text-[11px] text-white/55">
            {liveExhausted
              ? "Orientação por IA pausada nesta sessão. A checagem de luz, foco e estabilidade continua no aparelho."
              : checking
                ? "Verificação por IA em andamento."
                : "Checagem de luz, foco e estabilidade feita no aparelho, sem IA."}
            {liveBudget && !liveExhausted ? ` · ${liveBudget.remaining} verificação(ões) de IA restante(s)` : ""}
            {attempts && attempts.limit != null
              ? ` · ${Math.max(0, attempts.limit - attempts.used)} análise(s) finais restantes nesta sessão`
              : ""}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex w-11 justify-start">
              <span className="text-[10px] leading-tight text-white/60">
                {quality.dark ? "pouca luz" : quality.overexposed ? "muita luz" : "luz ok"}
                <br />
                {quality.moving ? "instável" : "firme"}
              </span>
            </div>
            <button
              type="button"
              onClick={capture}
              disabled={status === "starting"}
              aria-label="Tirar foto"
              className="h-[72px] w-[72px] rounded-full bg-white/25 p-1 disabled:opacity-40"
            >
              <span
                className={`block h-full w-full rounded-full ${
                  status === "ready" ? "bg-emerald-400" : status === "blocked" ? "bg-red-400" : "bg-white"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              aria-label="Trocar câmera"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <SwitchCamera className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
