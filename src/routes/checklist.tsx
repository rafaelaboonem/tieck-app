function CameraBlockPreview({ blockId, textColor }: { blockId: string; textColor: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsLive(false);
  };

  const openCamera = async () => {
    setError(null);
    if (isMobile) {
      inputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setIsLive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch (err: any) {
      setError("Não foi possível acessar a webcam. Verifique as permissões.");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    setDataUrl(url);
    stopStream();
  };

  useEffect(() => {
    return () => stopStream();
  }, []);

  return (
    <div className="space-y-4">
      <div
        className={`w-full h-64 border-2 ${dataUrl ? 'border-solid' : 'border-dashed border-neutral-300'} dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900/50 flex flex-col items-center justify-center gap-4 group transition-colors overflow-hidden relative`}
        style={dataUrl ? { borderColor: textColor } : undefined}
      >
        {dataUrl ? (
          <>
            <img
              src={dataUrl}
              alt="Capturada"
              className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-300 absolute inset-0 z-0"
            />
            <div className="absolute bottom-4 right-4 text-white text-[12px] px-3 py-1.5 rounded-md font-bold z-10 shadow-lg" style={{ backgroundColor: textColor }}>
              Imagem Capturada
            </div>
            <button
              type="button"
              onClick={() => setDataUrl(null)}
              className="absolute top-4 right-4 z-10 bg-white/95 hover:bg-white text-neutral-700 text-xs font-medium px-3 py-1.5 rounded-md border border-neutral-200 shadow-sm"
            >
              Tirar outra
            </button>
          </>
        ) : isLive ? (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover z-0" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
              <button
                type="button"
                onClick={capturePhoto}
                className="text-white text-sm font-semibold px-4 py-2 rounded-md shadow-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: textColor }}
              >
                Capturar
              </button>
              <button
                type="button"
                onClick={stopStream}
                className="bg-white/95 hover:bg-white text-neutral-700 text-sm font-medium px-4 py-2 rounded-md border border-neutral-200 shadow"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={openCamera} className="w-full h-full flex flex-col items-center justify-center gap-4 cursor-pointer">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${textColor}1A` }}>
              <Camera className="w-8 h-8" style={{ color: textColor }} />
            </div>
            <div className="text-center">
              <p className="font-semibold" style={{ color: textColor }}>Capturar foto</p>
              <p className="text-xs text-neutral-400">{isMobile ? "Toque para abrir a câmera" : "Clique para abrir a webcam"}</p>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
          </button>
        )}
        <input
          ref={inputRef}
          id={`camera-input-${blockId}`}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => setDataUrl((ev.target?.result as string) ?? null);
            reader.readAsDataURL(file);
          }}
        />
      </div>
    </div>
  );
}


function ChecklistPreview({
  blocks,
  title,
  onClose,
  onPublish,
  isPublishing,
  settings,
}: {
  blocks: any[];
  title: string;
  onClose: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  settings: {
    theme: string;
    font: string;
    bgColor: string;
    textColor: string;
    accentColor: string;
    btnBgColor: string;
    btnTextColor: string;
    pageWidth: string;
    baseFontSize: string;
    btnText: string;
    btnIcon?: string;
    btnIconPosition?: "start" | "end";
    logoWidth: string;
    logoHeight: string;
    logoRadius: string;
    thankYouTitle?: string;
    thankYouDescription?: string;
  };
}) {
  const { sidebarOpen } = useSidebar();
  const isDark = settings.theme === "Escuro";
  const [submitted, setSubmitted] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{
        backgroundColor: isDark ? "#1a1a1a" : settings.bgColor,
        color: isDark ? "#ffffff" : settings.textColor,
        fontFamily: `'${settings.font}', sans-serif`,
        fontSize: settings.baseFontSize,
      }}
    >
      <div className="sticky top-0 z-[110] flex items-center justify-between px-6 py-3 bg-white/80 backdrop-blur-md border-b border-neutral-100 dark:bg-neutral-900/80 dark:border-neutral-800">
        <div className={`flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? "pl-0" : "pl-14"}`}>
          <Link to="/organizar">
            <img src={logoUrl} alt="Logo" className="w-20 h-20 object-contain grayscale hover:grayscale-0 active:grayscale-0 transition-all cursor-pointer" />
          </Link>
          <span className="text-neutral-400">›</span>
          <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">Modo de Visualização</span>
          <h2 className="text-sm font-medium text-neutral-900 dark:text-white truncate max-w-[200px]">{title || "Sem título"}</h2>
        </div>
        <div className="flex items-center gap-2">

          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            className="text-xs font-bold bg-[#FF007F] text-white rounded-md px-4 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
          >
            {isPublishing ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </div>

      {submitted ? (
        <main className="max-w-4xl mx-auto px-6 pt-32 pb-32 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-blue-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">{settings.thankYouTitle || "Obrigado por preencher este formulário!"}</h1>
          <p className="opacity-70 mb-8">{settings.thankYouDescription || "Feito com Tieck, a forma mais simples de criar checklists gratuitamente."}</p>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-blue-600 font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-sm"
          >
            <span className="text-pink-500">*</span> Crie seu próprio checklist
          </button>
        </main>
      ) : (
      <main className="max-w-full mx-auto pb-32 relative">
        <div className="flex flex-col items-center w-full">
          <div className="w-full relative">
            <div className="absolute top-4 left-6 z-20">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-white/90 backdrop-blur-sm dark:bg-neutral-800/90 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-white dark:hover:bg-neutral-800 transition-all shadow-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
                Voltar a criar
              </button>
            </div>
            {/* Cover and Profile */}
            {(() => {
              const profileBlock = blocks.find((b) => b.type === "image" && b.variant === "profile");
              const coverBlock = blocks.find((b) => b.type === "image" && b.variant === "cover");
              return (
                 <div className={`w-full ${profileBlock?.src && coverBlock?.src ? "mb-20" : "mb-10"}`}>
                   <div className="relative">
                      {coverBlock?.src && (
                        <div className="relative w-full h-80 overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                          <img 
                            src={coverBlock.src} 
                            alt="Cover" 
                            className="w-full h-full"
                             style={{
                               transform: `translate(${(coverBlock as any).position?.x || 0}px, ${(coverBlock as any).position?.y || 0}px) scale(${(coverBlock as any).position?.zoom || 1})`,
                               transformOrigin: "center center",
                               objectFit: "none",
                               width: "auto",
                               height: "auto",
                             }}
                          />
                        </div>
                      )}
                     {profileBlock?.src && (
                       <div className={`${coverBlock?.src ? "absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" : "flex justify-center mb-8"} z-10`}>
                          <div 
                            className="border-4 border-white dark:border-neutral-900 shadow-lg overflow-hidden bg-white"
                            style={{
                              width: settings.logoWidth,
                              height: settings.logoHeight,
                              borderRadius: settings.logoRadius
                            }}
                          >
                           <img 
                             src={profileBlock.src} 
                             alt="Profile" 
                             className="w-full h-full"
                             style={{
                               transform: `translate(${(profileBlock as any).position?.x || 0}px, ${(profileBlock as any).position?.y || 0}px) scale(${(profileBlock as any).position?.zoom || 1})`,
                               transformOrigin: "center center",
                               objectFit: "contain",
                               backgroundColor: "#f5f5f5",
                             }}
                           />
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
              );
            })()}

            <div className="max-w-4xl mx-auto px-6 pt-12" style={{ maxWidth: settings.pageWidth }}>
            {title && (
              <h1 className="text-4xl font-bold mb-10 tracking-tight" style={{ color: settings.textColor }}>{title}</h1>
            )}

            <div className="space-y-8 pb-[300px]">
              {blocks.map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  settings={settings}
                  mode="preview"
                />
              ))}

              {blocks.some(b => INTERACTIVE_BLOCK_TYPES.includes(b.type)) && (
                <div className="mt-12 mb-4 flex">
                  <button
                    type="button"
                    onClick={() => setSubmitted(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all active:scale-95"
                    style={{
                      backgroundColor: settings.btnBgColor,
                      color: settings.btnTextColor,
                      width: "fit-content"
                    }}
                  >
                    {settings.btnIconPosition === "start" && renderBtnIcon(settings.btnIcon)}
                    {settings.btnText || "Enviar"}
                    {settings.btnIconPosition !== "start" && renderBtnIcon(settings.btnIcon)}
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </main>
      )}
    </div>
  );
}
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { lazy, Suspense } from "react";
import { EditableBlock } from "@/components/EditableBlock";
import { ColorPicker } from "@/components/ColorPicker";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useSidebar } from "@/contexts/SidebarContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ChevronLeft, AlertCircle } from "lucide-react";
import {
  FileText,
  LayoutTemplate,
  Navigation,
   Network,
  HelpCircle,
  History,
  Settings,
  Zap,
  Minus,
  Menu,
  CircleCheck,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Hash,
  Mail,
  Phone,
  Link2,
  Copy,
  ExternalLink,
  Upload,
  Camera,
  Calendar,
  Clock,
  SlidersHorizontal,
  Grid3x3,
  Star,
  GripVertical,
  Move,
  PenLine,
  ArrowUpDown,
  FilePlus,
  Smile,
  Type,
  Plus,
  Trash2,
  Heading1,
  Heading2,
  Heading3,
  Bookmark,
  Tag,
  Image as ImageIcon,
  Video,
  Volume2,
   Code,
   ListTodo,
   DollarSign,
   Mic,
   QrCode,
   PlusSquare,
    X,
    Eye,
    EyeOff,
    LogIn,
   User,
   Search,
   Bold,
   Italic,
   Underline,
   Palette,
   Highlighter,
    Hexagon,
    Sparkles,
    Copy as CopyIcon,
    ArrowRight,
    ArrowUpRight,
    ArrowRightCircle,
    ArrowBigRight,
    MoveRight,
    Send,
    SendHorizontal,
    Check,
    CheckCircle,
    CheckCheck,
    Ban,
  } from "lucide-react";
import logoUrl from "../assets/local/logo-k.webp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapAuthError } from "@/utils/auth-errors";
const InsightsTab = lazy(() => import("@/components/InsightsTab").then(m => ({ default: m.InsightsTab })));
const SubmissionsTab = lazy(() => import("@/components/SubmissionsTab").then(m => ({ default: m.SubmissionsTab })));
import { BlockRenderer, INTERACTIVE_BLOCK_TYPES } from "@/components/BlockRenderer";
import { CameraStandardStatus } from "@/components/padrao/CameraStandardStatus";
import { ensureCameraBlockIds, withNewCameraBlockId, extractCameraQuestions } from "@/lib/camera-blocks";
import { syncStandardsWithBlocks } from "@/lib/visual-standards";


const BTN_ICON_OPTIONS: { key: string; label: string; Icon: any }[] = [
  { key: "arrow-right", label: "Seta", Icon: ArrowRight },
  { key: "arrow-up-right", label: "Seta diagonal", Icon: ArrowUpRight },
  { key: "arrow-right-circle", label: "Seta em círculo", Icon: ArrowRightCircle },
  { key: "arrow-big-right", label: "Seta grande", Icon: ArrowBigRight },
  { key: "move-right", label: "Mover", Icon: MoveRight },
  { key: "send", label: "Enviar", Icon: Send },
  { key: "send-horizontal", label: "Enviar horizontal", Icon: SendHorizontal },
  { key: "check", label: "Check", Icon: Check },
  { key: "check-circle", label: "Check em círculo", Icon: CheckCircle },
  { key: "check-check", label: "Check duplo", Icon: CheckCheck },
  { key: "none", label: "Sem ícone", Icon: Ban },
];

export function renderBtnIcon(key: string | undefined) {
  const k = key || "arrow-right";
  if (k === "none") return null;
  const opt = BTN_ICON_OPTIONS.find((o) => o.key === k);
  if (!opt) return null;
  const Icon = opt.Icon;
  return <Icon className="w-4 h-4" aria-hidden />;
}


export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [{ title: "Editor — Tieck" }],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    return {
      id: search.id as string | undefined,
      workspace: search.workspace as string | undefined,
      category: search.category as string | undefined,
      settings: search.settings as boolean | undefined,
    };
  },
  component: NovoChecklistPage,
});

function NovoChecklistPage() {
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { id: checklistId, workspace: workspaceParam, category: categoryParam, settings: openSettingsParam } = Route.useSearch();
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // Bloqueio de publicação por bloco Câmera com IA ativa e sem critérios.
  const [publishBlocker, setPublishBlocker] = useState<
    | { blockId: string; label: string }
    | null
  >(null);
  const [isTitleAreaHovered, setIsTitleAreaHovered] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);

  // Evitar leitura de localStorage no SSR: inicializa com defaults e hidrata após montagem.
  const [title, setTitle] = useState<string>("");
  const [isStarted, setIsStarted] = useState<boolean>(!!checklistId);
  useEffect(() => {
    if (checklistId) return;
    if (typeof window === "undefined") return;
    const draftTitle = localStorage.getItem("draft_checklist_title") || "";
    if (draftTitle) setTitle(draftTitle);
    if (localStorage.getItem("draft_checklist_started") === "true") setIsStarted(true);
  }, [checklistId]);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [selectedFont, setSelectedFont] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (openSettingsParam) {
      setIsSettingsOpen(true);
    }
  }, [openSettingsParam]);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [theme, setTheme] = useState("Claro");
  const [font, setFont] = useState("Inter");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#37352F");
  const [btnBgColor, setBtnBgColor] = useState("#FF007F");
  const [btnTextColor, setBtnTextColor] = useState("#FFFFFF");
  const [btnText, setBtnText] = useState("Enviar");
  const [btnIcon, setBtnIcon] = useState<string>("arrow-right");
  const [btnIconPosition, setBtnIconPosition] = useState<"start" | "end">("end");
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [accentColor, setAccentColor] = useState("#37352F");
  const [pageWidth, setPageWidth] = useState("700px");
  const [baseFontSize, setBaseFontSize] = useState("16px");
  const [logoWidth, setLogoWidth] = useState("100px");
  const [logoHeight, setLogoHeight] = useState("100px");
  const [logoRadius, setLogoRadius] = useState("50px");
  const [coverHeight, setCoverHeight] = useState("25%");
  const [inputWidth, setInputWidth] = useState("320px");
  const [inputHeight, setInputHeight] = useState("36px");
  const [inputBg, setInputBg] = useState("#ffffff");
  const [inputPlaceholder, setInputPlaceholder] = useState("#bbbab8");
  const [inputBorder, setInputBorder] = useState("#d3d3d3");
  const [inputBorderWidth, setInputBorderWidth] = useState("1px");
  const [inputRadius, setInputRadius] = useState("8px");
  const [inputMarginBottom, setInputMarginBottom] = useState("10px");
  const [inputPadding, setInputPadding] = useState("10px");
  const [language, setLanguage] = useState("Português (Brasil)");
  const [redirectOnCompletion, setRedirectOnCompletion] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [progressBar, setProgressBar] = useState(false);
  const [partialSubmissions, setPartialSubmissions] = useState(false);
  const [checklistBranding, setChecklistBranding] = useState(true);
  const [dataRetention, setDataRetention] = useState(true);
  const [retentionDays, setRetentionDays] = useState(5);
  const [selfEmailNotif, setSelfEmailNotif] = useState(false);
  const [respondentEmailNotif, setRespondentEmailNotif] = useState(false);
  const [respondentEmailFieldId, setRespondentEmailFieldId] = useState("");
  const [respondentEmailSubject, setRespondentEmailSubject] = useState("Confirmação de envio");
  const [respondentEmailMessage, setRespondentEmailMessage] = useState("Obrigado por preencher nosso formulário! Recebemos suas respostas.");
  const [includeResponsesInEmail, setIncludeResponsesInEmail] = useState(true);
  const [ownerEmailAddress, setOwnerEmailAddress] = useState("");
  const [thankYouTitle, setThankYouTitle] = useState("Obrigado por preencher este formulário!");
  const [thankYouDescription, setThankYouDescription] = useState("Feito com Tieck, a forma mais simples de criar checklists gratuitamente.");
  const [customEmailDomainId, setCustomEmailDomainId] = useState<string | null>(null);
  const [userDomains, setUserDomains] = useState<any[]>([]);

  const [passwordProtect, setPasswordProtect] = useState(false);
  const [formPassword, setFormPassword] = useState("");

  const [closeForm, setCloseForm] = useState(false);
  const [closeFormScheduled, setCloseFormScheduled] = useState(false);
  const [closeFormDate, setCloseFormDate] = useState("");
  const [limitSubmissions, setLimitSubmissions] = useState(false);
  const [submissionLimit, setSubmissionLimit] = useState<number>(100);
  const [closedFormMessage, setClosedFormMessage] = useState(false);
  const [closedMessageText, setClosedMessageText] = useState(
    "Este formulário está fechado e não está mais aceitando respostas."
  );
  const [selectedVersion, setSelectedVersion] = useState<string>("current");
  const [versionHistory, setVersionHistory] = useState<
    { id: string; label: string; time: string; blocks: Block[]; isCurrent?: boolean }[]
  >([]);
  const previewBackupRef = useRef<Block[] | null>(null);

  // Floating selection toolbar (formatação ao selecionar texto no workspace)
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean;
    top: number;
    left: number;
    el: (HTMLTextAreaElement | HTMLInputElement | HTMLElement) | null;
    start: number;
    end: number;
    isContentEditable?: boolean;
  }>({ visible: false, top: 0, left: 0, el: null, start: 0, end: 0, isContentEditable: false });

  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState("#37352f");
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false);
  const [currentHighlightColor, setCurrentHighlightColor] = useState("#FFE999");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [sendButtonPanelOpen, setSendButtonPanelOpen] = useState(false);
  const [sendButtonPanelTab, setSendButtonPanelTab] = useState<"text" | "icon" | "position">("text");
  const sendButtonPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sendButtonPanelOpen) return;
    function onDocClick(e: MouseEvent) {
      const el = sendButtonPanelRef.current;
      if (el && !el.contains(e.target as Node)) setSendButtonPanelOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [sendButtonPanelOpen]);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRangeRef = useRef<Range | null>(null);
  const [settingsActiveTab, setSettingsActiveTab] = useState<"geral" | "compartilhar" | "envios" | "insights" | "emails" | "apresentacao">("geral");
  const sessionChecklistIdRef = useRef<string | null>(null);
  const [currentChecklistId, setCurrentChecklistId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [shortSlug, setShortSlug] = useState<string | null>(null);
  // Identificador público seguro: custom_slug (se existir) ou o id real.
  // Nunca produz "undefined"/"null"/vazio no link.
  const publicShareId = [shortSlug, currentChecklistId, checklistId]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find((v) => v && v !== "undefined" && v !== "null") || "";

  const [customDomain, setCustomDomain] = useState<string | null>(null);
  const [customDomainStatus, setCustomDomainStatus] = useState<'verified' | 'pending' | 'failed' | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setProfile(data));
    } else {
      setProfile(null);
    }
  }, [user]);


  useEffect(() => {
    if (user && customDomain) {
      supabase
        .from("user_domains")
        .select("status")
        .eq("domain", customDomain)
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setCustomDomainStatus(data.status as any);
        });
    }
  }, [user, customDomain]);

  useEffect(() => {
    if (!colorPickerOpen && !highlightPickerOpen && !linkPopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-color-picker-root]") && !target.closest("[data-link-popover-root]")) {
        setColorPickerOpen(false);
        setHighlightPickerOpen(false);
        setLinkPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [colorPickerOpen, highlightPickerOpen, linkPopoverOpen]);

  useEffect(() => {
    const handleSelection = () => {
      // Don't update toolbar while color picker is open (would lose selection)
      if (colorPickerOpen || highlightPickerOpen || linkPopoverOpen) return;
      const ae = document.activeElement as HTMLElement | null;
      if (!ae) return setSelectionToolbar((s) => ({ ...s, visible: false }));
      
      const isContentEditable = ae.contentEditable === "true";
      const isInput = ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement;

      if (!isContentEditable && !isInput) {
        return setSelectionToolbar((s) => ({ ...s, visible: false }));
      }

      if (!ae.closest("[data-workspace]") || ae.closest("[data-no-toolbar]")) {
        return setSelectionToolbar((s) => ({ ...s, visible: false }));
      }

      if (isContentEditable) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return setSelectionToolbar((s) => ({ ...s, visible: false }));
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        setSelectionToolbar({
          visible: true,
          top: rect.bottom + window.scrollY + 6,
          left: rect.left + window.scrollX,
          el: ae as any,
          start: 0, // Not used for contenteditable
          end: 0,
          isContentEditable: true
        });
        return;
      }

      const ta = ae as HTMLTextAreaElement | HTMLInputElement;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      if (start === end) {
        return setSelectionToolbar((s) => ({ ...s, visible: false }));
      }

      // Mirror logic for textarea/input
      const rect = ta.getBoundingClientRect();
      const mirror = document.createElement("div");
      const style = window.getComputedStyle(ta);
      [
        "boxSizing", "width", "fontFamily", "fontSize", "fontWeight",
        "lineHeight", "letterSpacing", "padding", "border", "whiteSpace",
      ].forEach((p) => {
        // @ts-expect-error - dynamic style assignment
        mirror.style[p] = style[p as any];
      });
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.whiteSpace = "pre-wrap";
      mirror.style.wordWrap = "break-word";
      mirror.style.top = "0";
      mirror.style.left = "-9999px";
      const value = ta.value ?? "";
      mirror.textContent = value.slice(0, start);
      const marker = document.createElement("span");
      marker.textContent = value.slice(start, end) || "\u200b";
      mirror.appendChild(marker);
      document.body.appendChild(mirror);
      const mRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const top = rect.top + window.scrollY + (mRect.top - mirrorRect.top) - ta.scrollTop + lineHeight + 6;
      const left = rect.left + window.scrollX + (mRect.left - mirrorRect.left) - ta.scrollLeft;
      document.body.removeChild(mirror);

      setSelectionToolbar({
        visible: true,
        top,
        left,
        el: ta,
        start,
        end,
        isContentEditable: false
      });
    };
    document.addEventListener("selectionchange", handleSelection);
    document.addEventListener("scroll", handleSelection, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelection);
      document.removeEventListener("scroll", handleSelection, true);
    };
  }, [colorPickerOpen, highlightPickerOpen, linkPopoverOpen]);

  const checkFormatting = (el: (HTMLTextAreaElement | HTMLInputElement | HTMLElement) | null, start: number, end: number) => {
    if (!el) return { isBold: false, isItalic: false, isUnderline: false };
    
    if (el instanceof HTMLElement && el.contentEditable === "true") {
      return {
        isBold: document.queryCommandState("bold"),
        isItalic: document.queryCommandState("italic"),
        isUnderline: document.queryCommandState("underline"),
      };
    }

    const text = (el as HTMLTextAreaElement | HTMLInputElement).value || "";
    const isBold = text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**";
    const isItalic = !isBold && text.slice(start - 1, start) === "*" && text.slice(end, end + 1) === "*";
    const isUnderline = text.slice(start - 3, start) === "<u>" && text.slice(end, end + 4) === "</u>";
    return { isBold, isItalic, isUnderline };
  };

  const applyWrap = (before: string, after: string, toggle: boolean = false) => {
    const el = selectionToolbar.el as HTMLTextAreaElement | HTMLInputElement | null;
    if (!el || !(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return;
    const { start: s, end: e } = selectionToolbar;
    const value = el.value;
    const selected = value.slice(s, e);
    
    let newValue: string;
    let newStart: number;
    let newEnd: number;

    if (toggle) {
      newValue = value.slice(0, s - before.length) + selected + value.slice(e + after.length);
      newStart = s - before.length;
      newEnd = newStart + selected.length;
    } else {
      newValue = value.slice(0, s) + before + selected + after + value.slice(e);
      newStart = s + before.length;
      newEnd = newStart + selected.length;
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(el, newValue);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    
    requestAnimationFrame(() => {
      el.focus();
      if ('setSelectionRange' in el) {
        el.setSelectionRange(newStart, newEnd);
      }
    });
  };

  const handleFormat = (action: "bold" | "italic" | "underline" | "color" | "highlight" | "link") => {
    const el = selectionToolbar.el;
    if (!el) return;

    if (el instanceof HTMLElement && el.contentEditable === "true") {
      switch (action) {
        case "bold": document.execCommand("bold", false); break;
        case "italic": document.execCommand("italic", false); break;
        case "underline": document.execCommand("underline", false); break;
        case "link": {
          const url = window.prompt("URL do link:");
          if (url) document.execCommand("createLink", false, url);
          break;
        }
        case "color": toast.message("Cor de texto: defina a lógica desejada."); break;
        case "highlight": toast.message("Marca-texto: defina a lógica desejada."); break;
      }
      return;
    }

    const { isBold, isItalic, isUnderline } = checkFormatting(el, selectionToolbar.start, selectionToolbar.end);

    switch (action) {
      case "bold":
        applyWrap("**", "**", isBold);
        break;
      case "italic":
        applyWrap("*", "*", isItalic);
        break;
      case "underline":
        applyWrap("<u>", "</u>", isUnderline);
        break;
      case "link": {
        const url = window.prompt("URL do link:");
        if (!url) return;
        applyWrap("[", `](${url})`);
        break;
      }
      case "color":
        toast.message("Cor de texto: defina a lógica desejada.");
        break;
      case "highlight":
        toast.message("Marca-texto: defina a lógica desejada.");
        break;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);
      const newUser = session?.user ?? null;
      setUser(newUser);
      
      if (newUser) {
        const postAuthAction = localStorage.getItem("post_auth_action");
        const isRelevantEvent = ['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED', 'SIGNED_UP'].includes(event);
        if ((postAuthAction === "publish" || postAuthAction === "save") && isRelevantEvent) {
          localStorage.removeItem("post_auth_action");
          console.log("Triggering auto-save for new user from listener");
          saveChecklist(newUser, postAuthAction === "publish");
        }
        
        if (isAuthModalOpen && (event === 'SIGNED_IN' || (event as string) === 'SIGNED_UP')) {
          setIsAuthModalOpen(false);
          // Only redirect to dashboard if we are NOT in the middle of a specific action like "publish"
          // The "publish" flow handles its own redirect after saving.
          if (postAuthAction !== "publish" && postAuthAction !== "save") {
            navigate({ to: "/inicio" });
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isAuthModalOpen]);

  useEffect(() => {
    const fetchDomains = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_domains")
        .select("*")
        .eq("user_id", user.id);
      if (data) setUserDomains(data);
    };
    fetchDomains();
  }, [user]);

  useEffect(() => {
    // Ensure sidebar is open by default on this page for better UX
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const previewVersion = (versionId: string) => {
    if (versionId === "current") {
      if (previewBackupRef.current) {
        setBlocks(previewBackupRef.current);
        previewBackupRef.current = null;
      }
      setSelectedVersion("current");
      return;
    }
    const v = versionHistory.find((x) => x.id === versionId);
    if (!v) return;
    if (!previewBackupRef.current) {
      previewBackupRef.current = blocks;
    }
    setBlocks(JSON.parse(JSON.stringify(v.blocks)));
    setSelectedVersion(versionId);
  };

  const closeHistory = () => {
    if (previewBackupRef.current) {
      setBlocks(previewBackupRef.current);
      previewBackupRef.current = null;
    }
    setSelectedVersion("current");
    setIsHistoryOpen(false);
  };

  const restoreSelected = () => {
    // Blocks already reflect the previewed version; just clear backup.
    previewBackupRef.current = null;
    setSelectedVersion("current");
    setIsHistoryOpen(false);
  };
  type Block =
    | { id: string; type: "text"; value: string; required?: boolean; hidden?: boolean; minChars?: number; maxChars?: number; defaultAnswer?: string }
    | { id: string; type: "short-answer"; placeholder: string }
    | { id: string; type: "long-answer"; placeholder: string }
    | { id: string; type: "multiple-choice"; options: { id: string; value: string }[] }
    | { id: string; type: "checkboxes"; options: { id: string; value: string; checked: boolean }[] }
    | { id: string; type: "dropdown"; options: { id: string; value: string }[]; selectedId: string | null }
    | { id: string; type: "multi-select"; options: { id: string; value: string }[]; selectedIds: string[] }
    | { id: string; type: "number"; placeholder: string }
    | { id: string; type: "email"; placeholder: string }
    | { id: string; type: "phone"; placeholder: string }
    | { id: string; type: "link"; placeholder: string }
    | { id: string; type: "file-upload"; files: { id: string; name: string; size: number }[] }
    | { id: string; type: "date"; placeholder: string }
    | { id: string; type: "time"; placeholder: string }
    | { id: string; type: "linear-scale"; selected: number | null }
    | {
        id: string;
        type: "matrix";
        rows: { id: string; label: string }[];
        columns: { id: string; label: string }[];
        selections: Record<string, string>;
      }
    | { id: string; type: "rating"; value: number }
    | { id: string; type: "signature"; dataUrl: string | null }
    | { id: string; type: "page-break" }
    | { id: string; type: "ranking"; options: { id: string; value: string }[]; selectedIds: string[] }
    | {
        id: string;
        /** Identificador estável do bloco, usado para vincular o padrão visual. */
        cameraBlockId?: string;
        type: "camera";

        dataUrls?: string[];
        allowMultiple?: boolean;
        maxPhotos?: number;
        title?: string;
        description?: string;
        required?: boolean;
        captureGuidance?: string;
        orientation?: "any" | "portrait" | "landscape";
        preCaptureMessage?: string | null;
        framingHint?: string | null;
        distanceHint?: string | null;
        lightingHint?: string | null;
        referenceImagePath?: string | null;
        referenceImageAlt?: string | null;
        vision?: {
          version?: string;
          enabled?: boolean;
          modelId?: string | null;
          modelVersion?: string | null;
          provider?: "cloudflare_workers_ai" | "manual";
          criteria?: string[];
          confidenceThreshold?: number | null;
          model?: string | null;
          threshold?: number | null;       // 0..1 (anomaly score máximo aceitável); null quando não há modelo
          minWidth?: number | null;        // px
          minHeight?: number | null;       // px
          onAnomaly?: "allow_continue" | "require_resubmit" | "block_completion" | "manual_review";
          onAnalysisFailure?: "allow_continue" | "manual_review" | "block_completion";
        };
      }
    | { id: string; type: "task-list"; options: { id: string; value: string; checked: boolean }[] }
    | { id: string; type: "counter"; value: number; min: number; max: number; step: number }
    | { id: string; type: "currency"; placeholder: string; currency: string }
    | { id: string; type: "audio"; src: string | null }
    | { id: string; type: "qr-code"; value: string }
    | { id: string; type: "heading-1"; value: string }
    | { id: string; type: "heading-2"; value: string }
    | { id: string; type: "heading-3"; value: string }
    | { id: string; type: "observation"; value: string }
     | { id: string; type: "label"; value: string }
     | { id: string; type: "image"; src: string | null; variant?: "profile" | "cover"; position?: { x: number; y: number; zoom: number } }
     | { id: string; type: "video"; src: string | null }
    | { id: string; type: "embed"; src: string | null }
    | { id: string; type: "divider" };
  const newId = () => Math.random().toString(36).slice(2, 10);
  const [blocks, setBlocks] = useState<Block[]>(() => {
    if (checklistId) return [{ id: newId(), type: "text", value: "" }];
    const saved = localStorage.getItem("draft_checklist_blocks");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse draft blocks", e);
      }
    }
    return [{ id: newId(), type: "text", value: "" }];
  });
  const [history, setHistory] = useState<Block[][]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
 
  // Auto-save drafts to localStorage only if NOT a persistent checklist from DB
  useEffect(() => {
    if (!checklistId) {
      localStorage.setItem("draft_checklist_title", title);
      localStorage.setItem("draft_checklist_blocks", JSON.stringify(blocks));
      localStorage.setItem("draft_checklist_started", isStarted ? "true" : "false");
    }
  }, [title, blocks, isStarted, checklistId]);

 
  useEffect(() => {
    // Only apply draft state if we're not editing an existing checklist
    if (!checklistId) {
      const savedStarted = localStorage.getItem("draft_checklist_started");
      // Only restore "started" mode if there's actual draft content
      if (savedStarted === "true") {
        const hasTitle = (localStorage.getItem("draft_checklist_title") || "").trim() !== "";
        let hasBlocks = false;
        try {
          const parsed = JSON.parse(localStorage.getItem("draft_checklist_blocks") || "[]");
          hasBlocks =
            Array.isArray(parsed) &&
            parsed.some(
              (b: any) =>
                (typeof b?.value === "string" && b.value.trim() !== "") ||
                (b?.type && b.type !== "text"),
            );
        } catch {}
        if (hasTitle || hasBlocks) setIsStarted(true);
      }
    } else {
      // If we are editing a specific ID, always start in the editor mode
      setIsStarted(true);
    }
  }, [checklistId]);
    useEffect(() => {
      const fetchExisting = async () => {
        if (!checklistId) {
          setCurrentChecklistId(sessionChecklistIdRef.current);
          return;
        }
        setCurrentChecklistId(null);
        try {
          const { data, error } = await supabase
            .from("checklists")
            .select("*")
            .or(`id.eq.${checklistId},custom_slug.eq.${checklistId}`)
            .single();
          
          if (data && !error) {
            setCurrentChecklistId(data.id);
            setTitle(data.title || "");
            setBlocks(
              ensureCameraBlockIds(
                ((data.blocks as Block[]) || [{ id: newId(), type: "text", value: "" }]) as any[],
              ).blocks as Block[],
            );

            setIsStarted(true);
            setShortSlug(data.custom_slug || null);
            setCustomDomain(data.custom_domain || null);
            
            if (data.settings) {
              const s = data.settings as any;
              // Central registry of personalization settings hydrated from DB.
              // Add new settings here and they are automatically restored on load —
              // prevents the "forgot to hydrate a field" bug class.
              const settingsHydrators: Array<[string, (v: any) => void]> = [
                ["theme", setTheme],
                ["font", setFont],
                ["bgColor", setBgColor],
                ["textColor", setTextColor],
                ["accentColor", setAccentColor],
                ["btnBgColor", setBtnBgColor],
                ["btnTextColor", setBtnTextColor],
                ["btnText", setBtnText],
                ["btnIcon", setBtnIcon],
                ["btnIconPosition", setBtnIconPosition],
                ["pageWidth", setPageWidth],
                ["baseFontSize", setBaseFontSize],
                ["language", setLanguage],
                ["redirectOnCompletion", setRedirectOnCompletion],
                ["redirectUrl", setRedirectUrl],
                ["progressBar", setProgressBar],
                ["selfEmailNotif", setSelfEmailNotif],
                ["respondentEmailNotif", setRespondentEmailNotif],
                ["respondentEmailFieldId", setRespondentEmailFieldId],
                ["respondentEmailSubject", setRespondentEmailSubject],
                ["respondentEmailMessage", setRespondentEmailMessage],
                ["includeResponsesInEmail", setIncludeResponsesInEmail],
                ["ownerEmailAddress", setOwnerEmailAddress],
                ["dataRetention", setDataRetention],
                ["retentionDays", setRetentionDays],
                ["partialSubmissions", setPartialSubmissions],
                ["checklistBranding", setChecklistBranding],
                ["thankYouTitle", setThankYouTitle],
                ["thankYouDescription", setThankYouDescription],
                ["passwordProtect", setPasswordProtect],
                ["formPassword", setFormPassword],
                ["closeForm", setCloseForm],
                ["closeFormScheduled", setCloseFormScheduled],
                ["closeFormDate", setCloseFormDate],
                ["limitSubmissions", setLimitSubmissions],
                ["submissionLimit", setSubmissionLimit],
                ["closedFormMessage", setClosedFormMessage],
                ["closedMessageText", setClosedMessageText],
              ];
              for (const [key, setter] of settingsHydrators) {
                if (s[key] !== undefined && s[key] !== null) setter(s[key]);
              }
              if (data.custom_email_domain_id) setCustomEmailDomainId(data.custom_email_domain_id);
            }
          }
        } catch (err) {
          console.error("Error fetching checklist:", err);
        }
      };
      fetchExisting();
    }, [checklistId]);

  useEffect(() => {
    const fetchDomains = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_domains")
        .select("*")
        .eq("status", "verified");
      if (data) setUserDomains(data);
    };
    fetchDomains();
  }, [user]);

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const slashStartRef = useRef<number | null>(null);
  const [slashReplaceForBlockId, setSlashReplaceForBlockId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerForBlockId, setPickerForBlockId] = useState<string | null>(null);
  const [pickerReplaceMode, setPickerReplaceMode] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRefs = useRef<Record<string, HTMLElement | null>>({});
  const focusBlockId = useRef<string | null>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<"before" | "after" | null>(null);
  const [optionsPanelBlockId, setOptionsPanelBlockId] = useState<string | null>(null);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);

  const startBlockDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    setDraggingId(id);
    setDragOverId(id);
    setDragOverPos(null);

    const onMove = (ev: PointerEvent) => {
      let foundId: string | null = null;
      let foundPos: "before" | "after" = "after";
      for (const [bid, el] of Object.entries(blockRefs.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          foundId = bid;
          foundPos = ev.clientY < rect.top + rect.height / 2 ? "before" : "after";
          break;
        }
      }
      if (!foundId) {
        const ids = Object.keys(blockRefs.current);
        const first = ids.find((bid) => blockRefs.current[bid]);
        const last = [...ids].reverse().find((bid) => blockRefs.current[bid]);
        if (first && last) {
          const firstRect = blockRefs.current[first]!.getBoundingClientRect();
          const lastRect = blockRefs.current[last]!.getBoundingClientRect();
          if (ev.clientY < firstRect.top) {
            foundId = first;
            foundPos = "before";
          } else if (ev.clientY > lastRect.bottom) {
            foundId = last;
            foundPos = "after";
          }
        }
      }
      setDragOverId(foundId);
      setDragOverPos(foundId ? foundPos : null);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraggingId((curDrag) => {
        setDragOverId((curOverId) => {
          setDragOverPos((curPos) => {
            if (curDrag && curOverId && curPos && curDrag !== curOverId) {
    setBlocks((prev) => {
      const fromIdx = prev.findIndex((b) => b.id === curDrag);
      const toIdxRaw = prev.findIndex((b) => b.id === curOverId);
      if (fromIdx < 0 || toIdxRaw < 0) return prev;
      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      let toIdx = next.findIndex((b) => b.id === curOverId);
      if (curPos === "after") toIdx += 1;
      next.splice(toIdx, 0, moved);
      return next;
    });
            }
            return null;
          });
          return null;
        });
        return null;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const optionSections = [
    {
      title: "Perguntas",
      options: [
        { icon: Camera, label: "Câmera" },
        { icon: Minus, label: "Resposta curta" },
        { icon: Menu, label: "Resposta longa" },
        { icon: CircleCheck, label: "Múltipla escolha" },
        { icon: CheckSquare, label: "Caixas de seleção" },
        { icon: ChevronDown, label: "Lista suspensa" },
        { icon: ListChecks, label: "Seleção múltipla" },
        { icon: Hash, label: "Número" },
        { icon: Mail, label: "Email" },
        { icon: Phone, label: "Telefone" },
        { icon: Link2, label: "Link" },
        { icon: Upload, label: "Upload de arquivo" },
        { icon: Calendar, label: "Data" },
        { icon: Clock, label: "Hora" },
        { icon: SlidersHorizontal, label: "Escala linear" },
        { icon: Grid3x3, label: "Matriz" },
        { icon: Star, label: "Avaliação" },
        { icon: PenLine, label: "Assinatura" },
        { icon: ArrowUpDown, label: "Ranking" },
        { icon: ListTodo, label: "Lista de tarefas" },
        { icon: PlusSquare, label: "Contador" },
        { icon: DollarSign, label: "Moeda/Valor" },
      ],
    },
    {
      title: "Blocos de layout",
      options: [
        { icon: FilePlus, label: "Nova página" },
        { icon: Type, label: "Texto" },
        { icon: Heading1, label: "Título 1" },
        { icon: Heading2, label: "Título 2" },
        { icon: Heading3, label: "Título 3" },
        { icon: Minus, label: "Divisor" },
        { icon: Bookmark, label: "Observação" },
        { icon: Tag, label: "Rótulo" },
      ],
    },
     {
       title: "Blocos de incorporação",
       options: [
         { icon: ImageIcon, label: "Imagem" },
          { icon: Hexagon, label: "Logo" },
         { icon: ImageIcon, label: "Capa" },
         { icon: Video, label: "Vídeo" },
         { icon: Mic, label: "Áudio" },
         { icon: QrCode, label: "Código QR" },
         { icon: Code, label: "Incorporar qualquer coisa" },
       ],
     },
  ];

  const filteredSections = optionSections
    .map((s) => ({
      ...s,
      options: s.options.filter((o) =>
        o.label.toLowerCase().includes(slashQuery.toLowerCase())
      ),
    }))
    .filter((s) => s.options.length > 0);

  const filteredOptions = filteredSections.flatMap((s) => s.options);

  const createBlockFromLabel = (label: string): Block | null => {
    switch (label) {
      case "Resposta curta": return { id: newId(), type: "short-answer", placeholder: "" };
      case "Resposta longa": return { id: newId(), type: "long-answer", placeholder: "" };
      case "Múltipla escolha": return { id: newId(), type: "multiple-choice", options: [{ id: newId(), value: "" }] };
      case "Caixas de seleção": return { id: newId(), type: "checkboxes", options: [{ id: newId(), value: "", checked: false }] };
      case "Lista suspensa": return { id: newId(), type: "dropdown", options: [{ id: newId(), value: "" }], selectedId: null };
      case "Seleção múltipla": return { id: newId(), type: "multi-select", options: [{ id: newId(), value: "" }], selectedIds: [] };
      case "Número": return { id: newId(), type: "number", placeholder: "" };
      case "Email": return { id: newId(), type: "email", placeholder: "" };
      case "Telefone": return { id: newId(), type: "phone", placeholder: "" };
      case "Link": return { id: newId(), type: "link", placeholder: "" };
      case "Upload de arquivo": return { id: newId(), type: "file-upload", files: [] };
      case "Data": return { id: newId(), type: "date", placeholder: "" };
      case "Hora": return { id: newId(), type: "time", placeholder: "" };
      case "Escala linear": return { id: newId(), type: "linear-scale", selected: null };
      case "Matriz": return {
        id: newId(), type: "matrix",
        rows: [{ id: newId(), label: "Linha 1" }, { id: newId(), label: "Linha 2" }, { id: newId(), label: "Linha 3" }],
        columns: [{ id: newId(), label: "Coluna 1" }, { id: newId(), label: "Coluna 2" }, { id: newId(), label: "Coluna 3" }],
        selections: {},
      };
      case "Avaliação": return { id: newId(), type: "rating", value: 0 };
      case "Assinatura": return { id: newId(), type: "signature", dataUrl: null };
      case "Ranking": return { id: newId(), type: "ranking", options: [{ id: newId(), value: "" }], selectedIds: [] };
      case "Nova página": return { id: newId(), type: "page-break" };
      case "Texto": return { id: newId(), type: "text", value: "" };
      case "Título 1": return { id: newId(), type: "heading-1", value: "" };
      case "Título 2": return { id: newId(), type: "heading-2", value: "" };
      case "Título 3": return { id: newId(), type: "heading-3", value: "" };
      case "Observação": return { id: newId(), type: "observation", value: "" };
      case "Rótulo": return { id: newId(), type: "label", value: "" };
      case "Divisor": return { id: newId(), type: "divider" };
      case "Imagem": return { id: newId(), type: "image", src: null };
      case "Logo": return { id: newId(), type: "image", src: null, variant: "profile" };
      case "Capa": return { id: newId(), type: "image", src: null, variant: "cover" };
      case "Vídeo": return { id: newId(), type: "video", src: null };
      case "Incorporar qualquer coisa": return { id: newId(), type: "embed", src: null };
      case "Lista de tarefas": return { id: newId(), type: "task-list", options: [{ id: newId(), value: "", checked: false }] };
      case "Contador": return { id: newId(), type: "counter", value: 0, min: 0, max: 100, step: 1 };
      case "Moeda/Valor": return { id: newId(), type: "currency", placeholder: "", currency: "R$" };
      case "Áudio": return { id: newId(), type: "audio", src: null };
      case "Código QR": return { id: newId(), type: "qr-code", value: "" };
      case "Câmera": return {
        id: newId(),
        cameraBlockId: crypto.randomUUID(),
        type: "camera",

        dataUrls: [],
        allowMultiple: false,
        maxPhotos: 5,
        title: "",
        description: "",
        required: false,
        captureGuidance: "",
        orientation: "any",
        preCaptureMessage: null,
        framingHint: null,
        distanceHint: null,
        lightingHint: null,
        referenceImagePath: null,
        referenceImageAlt: null,
        vision: {
          // Camera AI V2: todo bloco Camera é inteligente por padrão.
          version: "camera_ai_v2",
          enabled: true,
          provider: "cloudflare_workers_ai",
          criteria: [],
          minWidth: 640,
          minHeight: 480,
          onAnomaly: "require_resubmit",
          onAnalysisFailure: "block_completion",
        },
      };
      default: return null;
    }
  };

  const insertBlockFromPicker = (label: string) => {
    const targetId = pickerForBlockId;
    if (!targetId) return;
    const block = createBlockFromLabel(label);
    if (!block) return;
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === targetId);
      if (idx === -1) return prev;
      const targetBlock = prev[idx];
      const next = [...prev];
      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));

      // Replace mode: swap the block in place, preserving id
      if (pickerReplaceMode) {
        next[idx] = { ...block, id: targetBlock.id } as Block;
        focusBlockId.current = targetBlock.id;
        return next;
      }

      // If target block is empty text, replace it
      if (targetBlock.type === "text" && (!targetBlock.value || targetBlock.value.trim() === "")) {
        next[idx] = block;
        // Add empty line below to keep workspace available
        next.splice(idx + 1, 0, { id: newId(), type: "text", value: "" } as Block);
        focusBlockId.current = block.id;
      } else {
        // Otherwise insert below
        next.splice(idx + 1, 0, block);
        // Add empty line below if not already there or if needed
        if (block.type !== "text") {
          next.splice(idx + 2, 0, { id: newId(), type: "text", value: "" } as Block);
        }
        focusBlockId.current = block.id;
      }
      return next;
    });
    focusBlockId.current = block.id;
    setPickerOpen(false);
    setPickerQuery("");
    setPickerForBlockId(null);
    setPickerReplaceMode(false);
  };

  const pickerFilteredSections = optionSections
    .map((s) => ({
      ...s,
      options: s.options.filter((o) => o.label.toLowerCase().includes(pickerQuery.toLowerCase())),
    }))
    .filter((s) => s.options.length > 0);

  const handleStart = (font?: string) => {
    setIsStarted(true);
     localStorage.setItem("draft_checklist_started", "true");
    setIsTemplatesOpen(false);
    if (font) setSelectedFont(font);
    const firstId = blocks[0]?.id ?? null;
    setActiveBlockId(firstId);
    setTimeout(() => {
      if (firstId) textareaRefs.current[firstId]?.focus();
    }, 0);
  };

  const handleReset = () => {
    setIsStarted(false);
     localStorage.removeItem("draft_checklist_started");
     localStorage.removeItem("draft_checklist_title");
     localStorage.removeItem("draft_checklist_blocks");
    setIsTemplatesOpen(false);
    setSelectedFont("");
    setBlocks([{ id: newId(), type: "text", value: "" }]);
    setHistory([]);
    setSlashMenuOpen(false);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isStarted) {
      handleStart();
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Detect Ctrl+Z or Cmd+Z (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        
        // Only reset if we have content or are in the started state
        if (isStarted && history.length === 0) {
          // If all content empty, go back to initial screen
          const isEmpty =
            blocks.length === 1 &&
            blocks[0].type === "text" &&
            (blocks[0] as { value: string }).value.trim() === "";
          if (isEmpty) {
            handleReset();
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isStarted, blocks, history]);

  useEffect(() => {
    if (focusBlockId.current) {
      const id = focusBlockId.current;
      const attemptFocus = () => {
        const ta = textareaRefs.current[id];
        if (ta) {
          ta.focus();
          
          // Scroll smoothly to the block
          ta.scrollIntoView({ behavior: 'smooth', block: 'center' });

          if (ta instanceof HTMLInputElement || ta instanceof HTMLTextAreaElement) {
            const len = (ta.value || "").length;
            ta.setSelectionRange(len, len);
          } else if (ta.getAttribute("contenteditable") === "true") {
            const range = document.createRange();
            const selection = window.getSelection();
            if (selection) {
              range.selectNodeContents(ta);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
          focusBlockId.current = null;
          return true;
        }
        return false;
      };

      if (!attemptFocus()) {
        // Retry once after a tick if ref not ready
        setTimeout(attemptFocus, 10);
      }
    }
  }, [blocks]);

  const updateSlashFromContent = (blockId: string, value: string, caret: number) => {
    // Find a "/" before caret on same line with no space after it
    const before = value.slice(0, caret);
    const slashIdx = before.lastIndexOf("/");
    if (slashIdx === -1) {
      setSlashMenuOpen(false);
      return;
    }
    // Must be at start of line or preceded by whitespace
    const charBefore = slashIdx === 0 ? "\n" : before[slashIdx - 1];
    if (!/\s|\n/.test(charBefore) && slashIdx !== 0) {
      setSlashMenuOpen(false);
      return;
    }
    const query = before.slice(slashIdx + 1);
    if (/\s/.test(query)) {
      setSlashMenuOpen(false);
      return;
    }
    slashStartRef.current = slashIdx;
    setSlashQuery(query);
    setSlashIndex(0);
    setSlashMenuOpen(true);
    setActiveBlockId(blockId);

    // Position the menu near the caret using a mirror div
    const ta = textareaRefs.current[blockId];
    if (!ta) return;
    const rect = ta.getBoundingClientRect();
    const mirror = document.createElement("div");
    const style = window.getComputedStyle(ta);
    [
      "boxSizing", "width", "fontFamily", "fontSize", "fontWeight",
      "lineHeight", "letterSpacing", "padding", "border", "whiteSpace",
    ].forEach((p) => {
      // @ts-expect-error - dynamic style assignment
      mirror.style[p] = style[p as any];
    });
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.textContent = before.slice(0, slashIdx);
    const marker = document.createElement("span");
    marker.textContent = "/";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const mRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const top = rect.top + (mRect.top - mirrorRect.top) + 28;
    const left = rect.left + (mRect.left - mirrorRect.left);
    document.body.removeChild(mirror);
    setSlashMenuPos({ top, left });
  };

  const insertOption = (label: string) => {
    // Replace-mode: triggered by the "Substituir" option in a block's options panel.
    // Substitui o bloco no lugar, preservando o texto/valor existente quando possível.
    if (slashReplaceForBlockId) {
      const targetId = slashReplaceForBlockId;
      const newBlock = createBlockFromLabel(label);
      if (!newBlock) {
        setSlashMenuOpen(false);
        setSlashReplaceForBlockId(null);
        return;
      }
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === targetId);
        if (idx === -1) return prev;
        const targetBlock = prev[idx] as any;
        setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
        const merged: any = { ...newBlock, id: targetBlock.id };
        // Preserva o texto já escrito pelo usuário ao substituir o bloco.
        // Copia campos textuais comuns do bloco original para o novo, mesmo
        // quando o novo tipo não os possui originalmente — assim o usuário
        // não perde o conteúdo digitado ao trocar entre tipos.
        const carryText = (typeof targetBlock.value === "string" && targetBlock.value)
          || (typeof targetBlock.placeholder === "string" && targetBlock.placeholder)
          || "";
        if (typeof targetBlock.value === "string") {
          merged.value = targetBlock.value;
        } else if (carryText) {
          merged.value = carryText;
        }
        if (typeof targetBlock.placeholder === "string" && targetBlock.placeholder) {
          merged.placeholder = targetBlock.placeholder;
        }
        if (typeof targetBlock.subtitle === "string" && targetBlock.subtitle) {
          merged.subtitle = targetBlock.subtitle;
        }
        const next = [...prev];
        next[idx] = merged as Block;
        focusBlockId.current = targetBlock.id;
        return next;
      });
      setSlashMenuOpen(false);
      setSlashQuery("");
      setSlashReplaceForBlockId(null);
      return;
    }
    const blockId = activeBlockId;
    if (!blockId) return;
    const ta = textareaRefs.current[blockId];
    if (!ta || slashStartRef.current === null) return;
    const start = slashStartRef.current;
    let caret = 0;
    
    // Check selection from active element
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(ta);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      caret = preCaretRange.toString().length;
    } else if (ta instanceof HTMLTextAreaElement || ta instanceof HTMLInputElement) {
      caret = ta.selectionStart || 0;
    }

    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const block = prev[idx];
      if (block.type !== "text") return prev;
      const innerText = ta.innerText || "";
      const before = innerText.slice(0, start);
      const after = innerText.slice(caret);

      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));

      // Block-creating options
      if (
        label === "Resposta curta" ||
        label === "Resposta longa" ||
        label === "Múltipla escolha" ||
        label === "Caixas de seleção" ||
        label === "Lista suspensa" ||
        label === "Seleção múltipla" ||
        label === "Número" ||
        label === "Email" ||
        label === "Telefone" ||
        label === "Link" ||
        label === "Upload de arquivo" ||
        label === "Data" ||
        label === "Hora" ||
        label === "Escala linear" ||
        label === "Matriz" ||
        label === "Avaliação" ||
        label === "Assinatura" ||
        label === "Ranking" ||
        label === "Nova página" ||
        label === "Título 1" ||
        label === "Título 2" ||
        label === "Título 3" ||
        label === "Observação" ||
        label === "Rótulo" ||
        label === "Imagem" ||
        label === "Logo" ||
        label === "Capa" ||
        label === "Vídeo" ||
        label === "Incorporar qualquer coisa" ||
        label === "Lista de tarefas" ||
        label === "Contador" ||
        label === "Moeda/Valor" ||
        label === "Áudio" ||
        label === "Código QR" ||
        label === "Câmera" ||
        label === "Divisor"
      ) {
        // Prevent duplicate Logo/Capa
        if (label === "Logo" && prev.some(b => b.type === "image" && (b as any).variant === "profile")) {
          const next = [...prev];
          next[idx] = { ...block, value: before + after } as Block;
          return next;
        }
        if (label === "Capa" && prev.some(b => b.type === "image" && (b as any).variant === "cover")) {
          const next = [...prev];
          next[idx] = { ...block, value: before + after } as Block;
          return next;
        }

        const newBlocks: Block[] = [...prev];
        
        const answerBlock: Block =
          label === "Resposta curta"
            ? { id: newId(), type: "short-answer", placeholder: "" }
            : label === "Resposta longa"
              ? { id: newId(), type: "long-answer", placeholder: "" }
              : label === "Múltipla escolha"
                ? { id: newId(), type: "multiple-choice", options: [{ id: newId(), value: "" }] }
                : label === "Caixas de seleção"
                  ? { id: newId(), type: "checkboxes", options: [{ id: newId(), value: "", checked: false }] }
                  : label === "Lista suspensa"
                    ? { id: newId(), type: "dropdown", options: [{ id: newId(), value: "" }], selectedId: null }
                    : label === "Seleção múltipla"
                      ? { id: newId(), type: "multi-select", options: [{ id: newId(), value: "" }], selectedIds: [] }
                      : label === "Número"
                        ? { id: newId(), type: "number", placeholder: "" }
                        : label === "Email"
                          ? { id: newId(), type: "email", placeholder: "" }
                          : label === "Telefone"
                            ? { id: newId(), type: "phone", placeholder: "" }
                            : label === "Link"
                              ? { id: newId(), type: "link", placeholder: "" }
                                : label === "Upload de arquivo"
                                  ? { id: newId(), type: "file-upload", files: [] }
                                  : label === "Data"
                                    ? { id: newId(), type: "date", placeholder: "" }
                                      : label === "Hora"
                                        ? { id: newId(), type: "time", placeholder: "" }
                                        : label === "Escala linear"
                                          ? { id: newId(), type: "linear-scale", selected: null }
                                          : label === "Matriz"
                                            ? {
                                              id: newId(),
                                              type: "matrix",
                                              rows: [
                                                { id: newId(), label: "Linha 1" },
                                                { id: newId(), label: "Linha 2" },
                                                { id: newId(), label: "Linha 3" },
                                              ],
                                              columns: [
                                                { id: newId(), label: "Coluna 1" },
                                                { id: newId(), label: "Coluna 2" },
                                                { id: newId(), label: "Coluna 3" },
                                              ],
                                              selections: {},
                                            }
                                            : label === "Avaliação"
                                              ? { id: newId(), type: "rating", value: 0 }
                                              : label === "Assinatura"
                                                ? { id: newId(), type: "signature", dataUrl: null }
                                                : label === "Nova página"
                                                  ? { id: newId(), type: "page-break" }
                                                : label === "Ranking"
                                                  ? { id: newId(), type: "ranking", options: [{ id: newId(), value: "" }], selectedIds: [] }
                                                  : label === "Título 1"
                                                      ? { id: newId(), type: "heading-1", value: "" }
                                                      : label === "Título 2"
                                                        ? { id: newId(), type: "heading-2", value: "" }
                                                        : label === "Título 3"
                                                          ? { id: newId(), type: "heading-3", value: "" }
                                                            : label === "Observação"
                                                              ? { id: newId(), type: "observation", value: "" }
                                                              : label === "Rótulo"
                                                                ? { id: newId(), type: "label", value: "" }
                                                                 : label === "Imagem"
                                                                   ? { id: newId(), type: "image", src: null }
                                                                   : label === "Logo"
                                                                     ? { id: newId(), type: "image", src: null, variant: "profile" }
                                                                     : label === "Capa"
                                                                       ? { id: newId(), type: "image", src: null, variant: "cover" }
                                                                     : label === "Vídeo"
                                                                    ? { id: newId(), type: "video", src: null }
                                                                    : label === "Incorporar qualquer coisa"
                                                                    ? { id: newId(), type: "embed", src: null }
                                                                    : label === "Lista de tarefas"
                                                                    ? { id: newId(), type: "task-list", options: [{ id: newId(), value: "", checked: false }] }
                                                                    : label === "Contador"
                                                                    ? { id: newId(), type: "counter", value: 0, min: 0, max: 100, step: 1 }
                                                                    : label === "Moeda/Valor"
                                                                    ? { id: newId(), type: "currency", placeholder: "", currency: "R$" }
                                                                    : label === "Áudio"
                                                                    ? { id: newId(), type: "audio", src: null }
                                                                    : label === "Código QR"
                                                                    ? { id: newId(), type: "qr-code", value: "" }
                                                                    : label === "Câmera"
                                                                    ? ({ id: newId(), type: "camera" } as Block)
                                                                     : label === "Divisor"
                                                                   ? { id: newId(), type: "divider" }
                                                                 : { id: newId(), type: "text", value: "" };
 
          // Sempre remove o texto digitado (o "/" e a query de pesquisa)
          // Se o bloco atual está vazio (sem texto antes nem depois do '/'),
          // substitui o bloco atual pelo bloco selecionado.
          if (before.trim() === "" && after.trim() === "") {
            newBlocks[idx] = answerBlock;
          } else {
            // Se havia texto antes do '/', mantém no bloco original
            if (before.trim() !== "") {
              newBlocks[idx] = { ...block, value: before.trim() };
              newBlocks.splice(idx + 1, 0, answerBlock);
              
              // Se havia texto após o '/', preserva em um novo bloco
              if (after.trim() !== "") {
                const trailing: Block = { id: newId(), type: "text", value: after.trim() };
                newBlocks.splice(idx + 2, 0, trailing);
              } else {
                // Adiciona um bloco vazio abaixo para continuar digitando
                const empty: Block = { id: newId(), type: "text", value: "" };
                newBlocks.splice(idx + 2, 0, empty);
              }
            } else {
              // Sem texto antes, mas com texto depois
              newBlocks[idx] = answerBlock;
              const trailing: Block = { id: newId(), type: "text", value: after.trim() };
              newBlocks.splice(idx + 1, 0, trailing);
            }
          }
         
          focusBlockId.current = answerBlock.id;
          return newBlocks;
       }
 
       if (label === "Texto") {
         const newBlocks: Block[] = [...prev];
         newBlocks[idx] = { ...block, value: before + after };
         focusBlockId.current = block.id;
         return newBlocks;
       }

      const newBlocks = [...prev];
      newBlocks[idx] = { ...block, value: before + label + " " + after };
      return newBlocks;
    });
    setSlashMenuOpen(false);

    // Add to real-time history
    const now = new Date();
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    setBlocks(currentBlocks => {
      const newVersion = {
        id: Math.random().toString(36).slice(2, 10),
        label: label,
        time: `Brayan · ${timeStr}`,
        blocks: JSON.parse(JSON.stringify(currentBlocks)),
      };
      setVersionHistory((prev) => [newVersion, ...prev].slice(0, 50));
      return currentBlocks;
    });
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slashMenuOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (filteredOptions[slashIndex]) {
        e.preventDefault();
        insertOption(filteredOptions[slashIndex].label);
      }
    } else if (e.key === "Escape") {
      setSlashMenuOpen(false);
    }
  };


  const uploadToStorage = async (file: File, folder: string) => {
    if (!user) return null;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${folder}/${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('checklist-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('checklist-assets')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error: any) {
      console.error('Error:', error);
      toast.error("Erro ao enviar imagem: " + error.message);
      return null;
    }
  };


  const saveChecklist = useCallback(async (currentUser?: any, isPublishedOverride?: boolean, silent: boolean = false) => {
    const authUser = currentUser || user;
    
    if (!authUser) {
      if (!silent) {
        localStorage.setItem("post_auth_action", isPublishedOverride === false ? "save" : "publish");
        const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/checklist";
        navigate({ to: "/cadastro", search: { redirect: here } as any });
      }
      return;
    }

    if (isSavingRef.current) return;
    isSavingRef.current = true;
    
    if (!silent) setIsPublishing(true);
    try {
      // Determine publication state:
      // 1. If explicit override (button click), use that
      // 2. If silent auto-save, we don't change the status but we update the draft content
      let is_published = isPublishedOverride;

      // When publishing, ensure data retention is enabled by default (5 days)
      let effectiveDataRetention = dataRetention;
      let effectiveRetentionDays = retentionDays;
      if (isPublishedOverride === true && !dataRetention) {
        effectiveDataRetention = true;
        effectiveRetentionDays = 5;
        setDataRetention(true);
        setRetentionDays(5);
      }

      // IDs estáveis dos blocos /Camera: criados uma única vez e preservados
      // em edição, reordenação e movimentação.
      const { blocks: blocksWithIds } = ensureCameraBlockIds(blocks as any[]);

      const checklistData: any = {
        user_id: authUser.id,
        title: (title && title.trim()) ? title.trim() : "Sem título",
        blocks: blocksWithIds as any,

        custom_email_domain_id: customEmailDomainId,
        custom_domain: customDomain,
        settings: {
          theme, font, bgColor, textColor, accentColor, pageWidth, 
          baseFontSize, language, redirectOnCompletion, redirectUrl, progressBar,
          btnBgColor, btnTextColor, btnText, btnIcon, btnIconPosition, selfEmailNotif,
          respondentEmailNotif, respondentEmailFieldId,
          respondentEmailSubject, respondentEmailMessage,
          includeResponsesInEmail, ownerEmailAddress,
          dataRetention: effectiveDataRetention,
          retentionDays: effectiveRetentionDays,
          partialSubmissions,
          checklistBranding,
          thankYouTitle,
          thankYouDescription,
          passwordProtect,
          formPassword,
          closeForm,
          closeFormScheduled,
          closeFormDate,
          limitSubmissions,
          submissionLimit,
          closedFormMessage,
          closedMessageText,
         } as any
      };

      // is_published NÃO é definido pelo cliente ao publicar:
      // a RPC `publish_checklist` (server-side) valida os padrões visuais,
      // monta `published_content` e marca `is_published = true` num único passo.
      // Aqui só passamos is_published quando o cliente está DESpublicando (false).
      if (is_published === false) {
        checklistData.is_published = false;
      }

      // Only set workspace/category if provided in URL or if it's a new checklist
      if (workspaceParam !== undefined) {
        checklistData.workspace_id = workspaceParam;
      } else if (checklistId) {
        // When editing an existing checklist, don't change workspace_id unless specified
      } else if (!sessionChecklistIdRef.current) {
        // For new checklists, default to null unless specified
        checklistData.workspace_id = null;
      }

      if (categoryParam !== undefined) {
        checklistData.category = categoryParam;
      } else if (!checklistId && !sessionChecklistIdRef.current) {
        checklistData.category = null;
      }


      let result;
      result = await supabase
        .from("checklists")
        .select("id, custom_slug, is_published")
        .or(`id.eq.${checklistId || sessionChecklistIdRef.current || '00000000-0000-0000-0000-000000000000'},custom_slug.eq.${checklistId || 'null'}`)
        .single();
      
      const existingSlug = result.data?.custom_slug;
      // published_content is only updated when the user explicitly clicks "Publicar"
      // (handled above when isPublishedOverride === true). Auto-saves do not touch it.

      if (checklistId || sessionChecklistIdRef.current) {
        result = await supabase
          .from("checklists")
          .update(checklistData)
          .or(`id.eq.${checklistId || sessionChecklistIdRef.current},custom_slug.eq.${checklistId || 'null'}`)
          .select()
          .single();
      } else {
        result = await supabase
          .from("checklists")
          .insert(checklistData)
          .select()
          .single();
      }

      const { data, error } = result;
      if (error) throw error;
      if (data?.id) setCurrentChecklistId(data.id);

      // Publicação: delega ao backend a montagem do snapshot técnico.
      // Após salvar o rascunho, chamamos a RPC `publish_checklist`, que valida
      // os padrões visuais ativos e grava `published_content`
      // + `is_published = true` num único passo, sem confiar em valores técnicos
      // enviados pelo navegador.
      // Estado de publicação confirmado pelo SERVIDOR (nunca pelo cliente).
      let serverPublished: boolean = data?.is_published === true;
      let serverSlug: string | null = data?.custom_slug ?? null;

      if (isPublishedOverride === true && data?.id) {
        const { error: pubErr } = await supabase.rpc("publish_checklist", {
          p_checklist_id: data.id,
        });
        if (pubErr) {
          // O servidor recusa publicar bloco Camera com IA sem padrão visual
          // vinculado e ativo. Mensagem única e clara para o proprietário.
          const code = String((pubErr as any)?.message ?? "");
          if (code.includes("standard_not_configured") || code.includes("standard_not_active")) {
            const cam = (blocksWithIds as any[]).find(
              (b) => b?.type === "camera" && b?.vision?.enabled === true,
            );
            setPublishBlocker({
              blockId: String(cam?.id ?? ""),
              label: String(cam?.title || cam?.subtitle || "Câmera"),
            });
            throw new Error("Vincule e ative um padrão visual antes de publicar este checklist.");
          }
          throw pubErr;
        }


        // Releitura obrigatória: só liberamos o link público se o servidor
        // confirmar is_published = true.
        const { data: verified, error: verifyErr } = await supabase
          .from("checklists")
          .select("id, custom_slug, is_published")
          .eq("id", data.id)
          .single();
        if (verifyErr) throw verifyErr;
        serverPublished = verified?.is_published === true;
        serverSlug = verified?.custom_slug ?? null;
        if (!serverPublished) {
          throw new Error("Não foi possível confirmar a publicação. O checklist continua como rascunho.");
        }
      } else if (is_published === false) {
        serverPublished = false;
      }

      if (!silent) {
        const isActuallyPublished = serverPublished;
        toast.success(isActuallyPublished ? (checklistId ? "Alterações salvas!" : "Checklist publicado com sucesso!") : "Rascunho salvo!");
        if (serverSlug) setShortSlug(serverSlug);


        if (isActuallyPublished) {
          setTimeout(() => {
            setIsSettingsOpen(true);
            setSettingsActiveTab("compartilhar");
            if (!checklistId) {
              sessionChecklistIdRef.current = data.id;
              navigate({ to: "/checklist", search: { id: data.id }, replace: true });
            }
          }, 1000);
        } else if (!checklistId) {
          // If it was a new draft, update the URL without full redirect to keep editing
          sessionChecklistIdRef.current = data.id;
          // IMPORTANT: Navigate to update the search param 'id' so that subsequent 
          // calls to saveChecklist (and useEffects) see checklistId as set.
          navigate({ to: "/checklist", search: { id: data.id }, replace: true });
        }
      } else if (data && !checklistId) {
        // Store the ID of the newly created draft so future auto-saves update it instead of inserting again
        sessionChecklistIdRef.current = data.id;
      }

      // Padrões visuais acompanham os blocos: pergunta alterada exige nova
      // validação; bloco removido arquiva o padrão sem apagar histórico.
      if (data?.id) {
        void syncStandardsWithBlocks({
          checklistId: data.id,
          blocks: extractCameraQuestions(blocksWithIds as any[]).map((q) => ({
            cameraBlockId: q.cameraBlockId,
            question: q.question,
          })),
        });
      }

    } catch (err: any) {
      console.error("Save error:", err);
      if (!silent) toast.error(err.message || "Erro ao publicar");
    } finally {
      isSavingRef.current = false;
      if (!silent) setIsPublishing(false);
    }
  }, [user, title, blocks, theme, font, bgColor, textColor, accentColor, pageWidth, baseFontSize, language, redirectOnCompletion, redirectUrl, progressBar, btnBgColor, btnTextColor, btnText, btnIcon, btnIconPosition, checklistId, selfEmailNotif, respondentEmailNotif, respondentEmailFieldId, respondentEmailSubject, respondentEmailMessage, includeResponsesInEmail, ownerEmailAddress, dataRetention, retentionDays, partialSubmissions, checklistBranding, thankYouTitle, thankYouDescription, categoryParam, customDomain, passwordProtect, formPassword, closeForm, closeFormScheduled, closeFormDate, limitSubmissions, submissionLimit, closedFormMessage, closedMessageText]);

  // Auto-save to DB for logged in users
  useEffect(() => {
    if (!user) return;
    
    const timer = setTimeout(() => {
      if (isSavingRef.current) return;
      
      // Only auto-save if there's actual content AND a slash command has been used (per user request)
      // or if it already has an ID (meaning it was already created as draft)
      const hasSlashCommand = blocks.some(b => b.type !== "text");
      const hasContent = title.trim() !== "" || 
                        blocks.length > 1 || 
                        (blocks[0]?.type === "text" && (blocks[0] as any).value?.trim() !== "");
      
      const targetId = checklistId || sessionChecklistIdRef.current;

      if (hasContent && (hasSlashCommand || targetId)) {
        if (targetId) {
          // Always auto-save to current state but maintain published version 
          // to ensure background edits don't accidentally update the public view
          // unless explicitly published by the user
          saveChecklist(user, undefined, true);
        } else {
          // For a brand new checklist that doesn't have an ID yet,
          // create it as a draft (is_published = false)
          saveChecklist(user, false, true);
        }
      }
    }, 2000); // Auto-save after 2s of inactivity

    return () => clearTimeout(timer);
  }, [title, blocks, user, saveChecklist, checklistId]);

  useEffect(() => {
    const handleChecklistAction = (e: any) => {
      const action = e.detail;
      switch (action) {
        case 'add-logo':
          if (blocks.some(b => b.type === "image" && (b as any).variant === "profile")) {
            toast.error("Já existe um bloco de logo no checklist.");
            return;
          }
          setBlocks(prev => {
            const next = [{ id: newId(), type: "image" as const, src: null, variant: "profile" as any }, ...prev];
            return next;
          });
          setIsStarted(true);
          toast.success("Bloco de logo adicionado ao topo!");
          break;
        case 'add-cover':
          if (blocks.some(b => b.type === "image" && (b as any).variant === "cover")) {
            toast.error("Já existe um bloco de capa no checklist.");
            return;
          }
          setBlocks(prev => {
            const next = [{ id: newId(), type: "image" as const, src: null, variant: "cover" as any }, ...prev];
            return next;
          });
          setIsStarted(true);
          toast.success("Bloco de capa adicionado ao topo!");
          break;
        case 'customize':
          setIsCustomizeOpen(true);
          break;
        case 'preview':
          setIsPreviewMode(true);
          break;
        case 'publish':
          saveChecklist(user, true);
          break;
        case 'settings':
          setIsSettingsOpen(true);
          break;
      }
    };

    window.addEventListener('checklist-action', handleChecklistAction);
    return () => window.removeEventListener('checklist-action', handleChecklistAction);
  }, [blocks, user, saveChecklist]);

  const handleAuth = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!authEmail || !authPassword) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }
    setIsAuthLoading(true);
    console.log("handleAuth started", { isSignUp, authEmail });
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              display_name: authEmail.split('@')[0],
            }
          }
        });
        if (error) throw error;
        if (data?.session) {
          toast.success("Cadastro concluído!");
          navigate({ to: "/inicio" });
        } else {
          toast.success("Cadastro realizado! Verifique seu email para confirmar.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        toast.success("Login concluído!");
        navigate({ to: "/inicio" });
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      toast.error(mapAuthError(err.message));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) toast.error(mapAuthError(error.message));
  };

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks((prev) => {
      const newBlocks = prev.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b));
      // Only push to history if it's a significant change (e.g. not every keystroke)
      // or if we want literal "last 5 changes". 
      // To respect the "last 5 changes" request and avoid duplicity:
      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
      return newBlocks;
    });
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;

      // If it's the only block, just clear it if it's text, otherwise replace with empty text
      if (prev.length === 1) {
        const block = prev[0];
        if (block.type === "text" && (block.value === "" || block.value === "<br>")) return prev;
        
        const nid = newId();
        focusBlockId.current = nid;
        setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
        return [{ id: nid, type: "text", value: "" } as Block];
      }

      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));

      const newBlocks = prev.filter((b) => b.id !== id);

      // Use a local variable to determine target ID to avoid ref race conditions in effects
      const targetIdx = Math.max(0, idx - 1);
      const targetId = newBlocks[targetIdx]?.id;
      if (targetId) {
        focusBlockId.current = targetId;
      }

      return newBlocks;
    });
  }, []);

  const duplicateBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const block = prev[idx];
      const newBlock = withNewCameraBlockId(JSON.parse(JSON.stringify(block)));
      newBlock.id = newId();

      const newBlocks = [...prev];
      newBlocks.splice(idx + 1, 0, newBlock);
      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
      return newBlocks;
    });
  }, []);

  const undo = () => {
    if (history.length > 0) {
      const previousState = history[0];
      setHistory((prev) => prev.slice(1));
      setBlocks(previousState);
    }
  };

  const settingsChecklistId = currentChecklistId || sessionChecklistIdRef.current || checklistId || null;

  return (
    <>
     <link rel="preconnect" href="https://fonts.googleapis.com" />
     <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
     <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Poppins:wght@400;500;600;700&family=Lato:wght@400;700&family=Open+Sans:wght@400;600;700&family=Montserrat:wght@400;500;600;700&family=Playfair+Display:wght@400;700&family=Merriweather:wght@400;700&family=Ubuntu:wght@400;500;700&family=Oswald:wght@400;500;700&family=Raleway:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>{`
      .workspace-content .workspace-input,
      .workspace-content .bg-white:not(aside *):not(button),
      .workspace-content .bg-neutral-50:not(aside *):not(button) {
        background-color: var(--input-bg) !important;
        border-color: var(--input-border) !important;
        border-width: var(--input-border-width) !important;
        border-radius: var(--input-radius) !important;
        color: inherit !important;
        max-width: var(--input-width) !important;
        min-height: var(--input-height) !important;
        padding: var(--input-padding) !important;
        margin-bottom: var(--input-margin-bottom) !important;
      }
      .workspace-content input::placeholder,
      .workspace-content textarea::placeholder {
        color: var(--input-placeholder) !important;
      }
      .workspace-content .text-neutral-400 {
        color: var(--input-placeholder) !important;
        opacity: 0.7;
      }
      .workspace-content .text-neutral-700,
      .workspace-content .text-neutral-800,
      .workspace-content .text-neutral-900 {
        color: inherit !important;
      }
      .workspace-content .border-neutral-200,
      .workspace-content .border-neutral-100 {
        border-color: var(--input-border) !important;
      }
      .workspace-content .workspace-btn-primary {
        background-color: var(--btn-bg) !important;
        color: var(--btn-text) !important;
        border-radius: var(--input-radius) !important;
      }
      .workspace-content .workspace-accent-bg {
        background-color: var(--accent-color) !important;
      }
      .workspace-content .workspace-accent-border {
        border-color: var(--accent-color) !important;
      }
      .workspace-content button[type="button"]:not(.workspace-input):not(.workspace-btn-primary) {
        border-radius: var(--input-radius) !important;
      }
    `}</style>
    <DashboardLayout>
      <div 
        className={`flex-1 flex flex-col transition-colors duration-200 ${theme === "Escuro" ? "bg-[#1a1a1a] text-white" : "bg-white text-neutral-900"}`}
      style={{ 
        backgroundColor: theme === "Escuro" ? "#1a1a1a" : bgColor,
         fontFamily: `'${font || selectedFont || "Inter"}', sans-serif`,
        fontSize: baseFontSize,
        // CSS Variables for child components
        "--accent-color": accentColor,
        "--btn-bg": btnBgColor,
        "--btn-text": btnTextColor,
        "--input-bg": theme === "Escuro" ? "#2a2a2a" : inputBg,
        "--input-border": theme === "Escuro" ? "#3a3a3a" : inputBorder,
        "--input-border-width": inputBorderWidth,
        "--input-radius": inputRadius,
        "--input-width": inputWidth,
        "--input-height": inputHeight,
        "--input-padding": inputPadding,
        "--input-margin-bottom": inputMarginBottom,
        "--input-placeholder": inputPlaceholder,
      } as React.CSSProperties}
    >
      {isPreviewMode && (
        <ChecklistPreview
          blocks={blocks}
          title={title}
          onClose={() => setIsPreviewMode(false)}
          onPublish={saveChecklist}
          isPublishing={isPublishing}
          settings={{
            theme,
            font: font || selectedFont || "Inter",
            bgColor,
            textColor,
            accentColor,
            btnBgColor,
            btnTextColor,
            pageWidth,
            baseFontSize,
            btnText,
            btnIcon,
            btnIconPosition,
            logoWidth,
            logoHeight,
            logoRadius,
            thankYouTitle,
            thankYouDescription,
          }}
        />
      )}

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-100">
        <div className={`flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? "pl-0" : "pl-14"}`}>
          <Link to={user ? "/inicio" : "/"}>
            <img src={logoUrl} alt="Logo" className="w-14 h-14 object-contain grayscale hover:grayscale-0 active:grayscale-0 transition-all cursor-pointer" />
          </Link>
          <span className="text-neutral-400">›</span>
          <Link to={user ? "/inicio" : "/"} className="text-neutral-600 hover:text-neutral-900 transition-colors text-sm">
            {user ? (currentWorkspace?.name || "Meu workspace") : "Início"}
          </Link>
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-700 font-medium text-sm">{title || "Sem título"}</span>
        </div>

        <div className="flex items-center gap-3 text-sm text-neutral-500">
          {user && (
            <>
              <button className="hover:text-neutral-900" aria-label="Integrações">
                <Zap className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="hover:text-neutral-900"
                aria-label="Histórico"
              >
                <History className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="hover:text-neutral-900 flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            <span>Configuração</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCustomizeOpen((v) => !v)}
            className={`hover:text-neutral-900 px-2 py-1 rounded-md ${isCustomizeOpen ? "ring-1 ring-blue-400 text-neutral-900" : ""}`}
          >
            Personalizar
          </button>
          <button 
            type="button"
            onClick={() => setIsPreviewMode(true)}
            className="hover:text-neutral-900"
          >
            Pré-visualizar
          </button>
          <button 
            type="button"
            onClick={() => saveChecklist(undefined, true)}
            disabled={isPublishing}
            className="text-xs font-bold bg-[#FF007F] text-white rounded-md px-4 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
          >
            {isPublishing ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </header>

      {/* Editor */}
      <main 
        className="flex-1 flex flex-col items-center pt-24 pb-20 overflow-x-hidden"
        style={{ 
          backgroundColor: theme === "Escuro" ? "#1a1a1a" : bgColor 
        }}
      >
        <div className="w-full">
            {isStarted && (() => {
              const profileBlock = blocks.find((b) => b.type === "image" && (b as any).variant === "profile");
              const coverBlock = blocks.find((b) => b.type === "image" && (b as any).variant === "cover");
              
              if (!profileBlock && !coverBlock) return null;

              return (
                <div className="w-full mb-10">
                  <div className={`relative ${coverBlock && profileBlock ? "mb-16" : ""}`}>
                    {coverBlock && (
                      <div className="relative w-full -mt-24 h-80">
                        <ImageBlock
                          key={coverBlock.id}
                          src={(coverBlock as any).src}
                          variant="cover"
                          position={(coverBlock as any).position}
                          onPositionChange={(pos) => updateBlock(coverBlock.id, { position: pos } as any)}
                          onChange={(src) =>
                            updateBlock(coverBlock.id, { src } as Partial<Block>)
                          }
                          onRemove={() => removeBlock(coverBlock.id)}
                        />
                      </div>
                    )}
                    {profileBlock && (
                      <div className={`${coverBlock ? "absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" : "flex justify-center mb-2"} z-10`}>
                        <ImageBlock
                          key={profileBlock.id}
                          src={(profileBlock as any).src}
                          variant="profile"
                          logoSettings={{
                            width: logoWidth,
                            height: logoHeight,
                            radius: logoRadius
                          }}
                          position={(profileBlock as any).position}
                          onPositionChange={(pos) => updateBlock(profileBlock.id, { position: pos } as any)}
                          onChange={(src) =>
                            updateBlock(profileBlock.id, { src } as Partial<Block>)
                          }
                          onRemove={() => removeBlock(profileBlock.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          <div 
            className="w-full mx-auto px-6"
            style={{ 
              maxWidth: pageWidth,
              color: textColor 
            }}
          >
            <div 
              onMouseEnter={() => setIsTitleAreaHovered(true)}
              onMouseLeave={() => setIsTitleAreaHovered(false)}
              className="group relative"
            >
              {isStarted && (
                <div 
                  className={`flex items-center gap-5 mb-2 text-sm text-neutral-500 transition-all duration-300 ${
                    isTitleAreaHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={blocks.some((b) => b.type === "image" && (b as any).variant === "profile")}
                      onCheckedChange={(checked) => {
                        setBlocks((prev) => {
                          setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
                          if (!checked) {
                            return prev.filter((b) => !(b.type === "image" && (b as any).variant === "profile"));
                          } else {
                            if (prev.some(b => b.type === "image" && (b as any).variant === "profile")) return prev;
                            return [
                              { id: newId(), type: "image", src: null, variant: "profile" } as Block,
                              ...prev,
                            ];
                          }
                        });
                      }}
                      className="scale-75 data-[state=checked]:bg-[#FF007F]"
                    />
                    <span className="flex items-center gap-1.5">
                      <Hexagon className="w-4 h-4" strokeWidth={1.75} />
                      Logo
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={blocks.some((b) => b.type === "image" && (b as any).variant === "cover")}
                      onCheckedChange={(checked) => {
                        setBlocks((prev) => {
                          setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
                          if (!checked) {
                            return prev.filter((b) => !(b.type === "image" && (b as any).variant === "cover"));
                          } else {
                            if (prev.some(b => b.type === "image" && (b as any).variant === "cover")) return prev;
                            const profileIdx = prev.findIndex((b) => b.type === "image" && (b as any).variant === "profile");
                            const newBlock: Block = { id: newId(), type: "image", src: null, variant: "cover" } as Block;
                            const next = [...prev];
                            next.splice(profileIdx >= 0 ? profileIdx + 1 : 0, 0, newBlock);
                            return next;
                          }
                        });
                      }}
                      className="scale-75 data-[state=checked]:bg-[#FF007F]"
                    />
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4" strokeWidth={1.75} />
                      Capa
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustomizeOpen((v) => !v)}
                    className="flex items-center gap-1.5 hover:text-neutral-900 transition-colors"
                  >
                    <Palette className="w-4 h-4" strokeWidth={1.75} />
                    <span>Personalizar</span>
                  </button>
                </div>
              )}

              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isStarted && !title.trim()) {
                    e.preventDefault();
                    handleStart();
                  }
                }}
                placeholder="Título do checklist"
                className="w-full text-4xl font-bold placeholder:text-neutral-300 border-none outline-none bg-transparent"
                style={{ color: textColor }}
                autoFocus
              />
            </div>

          {!isStarted ? (
            <>
              {!isTemplatesOpen ? (
                <div className="mt-8 space-y-2 text-sm text-neutral-500">
                  <div
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-50 cursor-text transition-colors"
                    onClick={() => handleStart()}
                    onKeyDown={handleKeyDown}
                    tabIndex={0}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Pressione Enter para começar do zero</span>
                  </div>
                  <div 
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => setIsTemplatesOpen(true)}
                  >
                    <LayoutTemplate className="w-4 h-4" />
                    <span>Usar um modelo</span>
                  </div>
                </div>
              ) : (
                <div className="mt-8 p-6 bg-neutral-50 rounded-xl border border-neutral-100 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-neutral-900">Modelos Disponíveis</h3>
                    <button 
                      onClick={() => setIsTemplatesOpen(false)}
                      className="text-xs text-neutral-500 hover:text-neutral-900"
                    >
                      Voltar
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {["Poppins", "Montserrat", "Roboto"].map((font) => (
                      <button
                        key={font}
                        onClick={() => handleStart(font)}
                        className="flex flex-col items-center gap-3 p-4 bg-white rounded-lg border border-neutral-200 hover:border-pink-300 hover:shadow-md transition-all group"
                      >
                        <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 group-hover:bg-pink-50 group-hover:text-pink-500 transition-colors">
                          <LayoutTemplate className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium text-neutral-700">{font}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-10 text-sm text-neutral-700 leading-7">
                ChecklistApp é um construtor de checklists que{" "}
                <span className="bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded">
                  funciona como um documento
                </span>
                .
                <br />
                Basta digitar{" "}
                <span className="text-pink-500 font-medium px-1">/</span> para
                inserir blocos e{" "}
                <span className="text-pink-500 font-medium px-1">@</span> para
                mencionar respostas de perguntas.
              </p>

              <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
                <div>
                  <p className="font-semibold text-neutral-900 mb-3">Começar</p>
                  <ul className="space-y-2.5 text-neutral-600">
                    <Item icon={Navigation} label="Crie seu primeiro checklist" onClick={() => handleStart()} />
                    <Item icon={LayoutTemplate} label="Comece com modelos" onClick={() => setIsTemplatesOpen(true)} />
                    <Item icon={FileText} label="Incorpore seu checklist" />
                    <Item icon={HelpCircle} label="Central de ajuda" />
                    <Item icon={Zap} label="Conheça o ChecklistApp Pro" />
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900 mb-3">Como usar</p>
                   <ul className="space-y-2.5 text-neutral-600">
                     <Item icon={FilePlus} label="Nova pagina" />
                     <Item icon={Code} label="Incorporar qualquer coisa" />
                     <Item icon={Network} label="Conexões" />
                     <Item icon={Video} label="Vídeo" />
                   </ul>
                </div>
              </div>
            </>
          ) : (
            <div
              className="mt-8 space-y-3 pb-32"
              data-workspace
              style={{ fontFamily: selectedFont ? `'${selectedFont}', sans-serif` : undefined }}
              onClick={(e) => {
                // Se clicar no container (espaço vazio abaixo ou entre blocos)
                if (e.target === e.currentTarget) {
                  const lastBlock = blocks[blocks.length - 1];
                  if (lastBlock && lastBlock.type === "text" && (lastBlock.value === "" || lastBlock.value === "<br>")) {
                    // Já existe um bloco de texto vazio no final, foca ele
                    focusBlockId.current = lastBlock.id;
                    setBlocks([...blocks]); // Força re-render para o useEffect de foco
                  } else {
                    // Adiciona um novo bloco de texto no final
                    const id = newId();
                    setBlocks((prev) => {
                      setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
                      return [...prev, { id, type: "text", value: "" } as Block];
                    });
                    focusBlockId.current = id;
                  }
                }
              }}
            >
               {blocks.map((block, i) => {
                 if (block.type === "image" && (block.variant === "profile" || block.variant === "cover")) {
                   return null;
                 }
                 const inner: React.ReactNode = (() => {
                  if (block.type === "text") {
                    const isActive = activeBlockId === block.id;
                    return (
                      <div className="relative w-full group">
                        <EditableBlock
                          key={block.id}
                          onBlur={() => {
                            setTimeout(() => {
                              setSlashMenuOpen(false);
                            }, 150);
                          }}
                          onChange={(html) => {
                            updateBlock(block.id, { value: html } as Partial<Block>);
                            
                            const el = textareaRefs.current[block.id];
                            if (el) {
                              const selection = window.getSelection();
                              if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                if (el.contains(range.endContainer)) {
                                  const preCaretRange = range.cloneRange();
                                  preCaretRange.selectNodeContents(el);
                                  preCaretRange.setEnd(range.endContainer, range.endOffset);
                                  const caretOffset = preCaretRange.toString().length;
                                  updateSlashFromContent(block.id, el.innerText, caretOffset);
                                }
                              }
                            }
                          }}
                          onKeyDown={(e) => handleContentKeyDown(e as any)}
                          onKeyDownCapture={(e) => {
                            if (e.key === "Backspace") {
                              const selection = window.getSelection();
                              if (!selection) return;

                              const range = selection.getRangeAt(0);
                              const isAtStart = range.startOffset === 0 && range.collapsed;
                              const innerText = (textareaRefs.current[block.id] as HTMLElement)?.innerText || "";
                              const isEmpty = block.value === "" || block.value === "<br>" || innerText.replace(/\n/g, "").trim() === "";

                              if (isEmpty || isAtStart) {
                                if (i > 0) {
                                  e.preventDefault();
                                  removeBlock(block.id);
                                }
                              }
                            } else if (e.key === "Delete") {
                              const selection = window.getSelection();
                              if (!selection) return;

                              const el = textareaRefs.current[block.id];
                              const innerText = el?.innerText || "";
                              const range = selection.getRangeAt(0);
                              const isAtEnd = range.startOffset === innerText.length && range.collapsed;
                              const isEmpty = block.value === "" || block.value === "<br>" || innerText.replace(/\n/g, "").trim() === "";

                              if (isEmpty || isAtEnd) {
                                e.preventDefault();
                                const idx = blocks.findIndex(b => b.id === block.id);
                                const nextBlock = blocks[idx + 1];
                                if (nextBlock) {
                                  removeBlock(nextBlock.id);
                                }
                              }
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              const selection = window.getSelection();
                              if (!selection) return;

                              const el = textareaRefs.current[block.id] as HTMLElement;
                              if (!el) return;

                              const range = selection.getRangeAt(0);
                              const preCaretRange = range.cloneRange();
                              preCaretRange.selectNodeContents(el);
                              preCaretRange.setEnd(range.endContainer, range.endOffset);
                              const caretOffset = preCaretRange.toString().length;

                              const innerText = el.innerText || "";
                              const before = innerText.slice(0, caretOffset);
                              const after = innerText.slice(caretOffset);

                              const idx = blocks.findIndex(b => b.id === block.id);
                              const nextId = newId();
                              
                              setBlocks(prev => {
                                setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
                                const next = [...prev];
                                const currentBlock = next[idx];
                                if (currentBlock.type === "text") {
                                  next[idx] = { ...currentBlock, value: before };
                                }
                                next.splice(idx + 1, 0, { id: nextId, type: "text", value: after } as Block);
                                return next;
                              });

                              focusBlockId.current = nextId;
                            }
                          }}
                          ref={(el) => {
                            if (el) textareaRefs.current[block.id] = el as any;
                          }}
                          value={(() => {
                            if (!block.value) return "";
                            if (!block.value.includes("<") && (block.value.includes("**") || block.value.includes("*"))) {
                               return block.value
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>');
                            }
                            return block.value;
                          })()}
                          className="w-full text-lg border-none outline-none bg-transparent leading-relaxed min-h-[1.6em] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                          style={{ color: "inherit" }}
                        />
                        {(!block.value || block.value === "<br>") && (
                          <div className="absolute inset-0 pointer-events-none text-neutral-400 text-lg opacity-50">
                            Digite '/' para inserir blocos
                          </div>
                        )}
                      </div>
                    );
                  }
                 if (
                   block.type === "short-answer" ||
                   block.type === "number" ||
                   block.type === "email" ||
                   block.type === "phone" ||
                   block.type === "link" ||
                   block.type === "date" ||
                   block.type === "time"
                 ) {
                   return (
                    <div
                      key={block.id}
                      onFocus={() => setActiveBlockId(block.id)}
                      className="group flex flex-col gap-2 border border-transparent transition-colors"
                    >
                     <input
                       type="text"
                       ref={(el) => {
                         if (el) textareaRefs.current[block.id] = el as any;
                       }}
                       value={block.placeholder}
                       onChange={(e) => updateBlock(block.id, { placeholder: e.target.value } as Partial<Block>)}
                         onKeyDown={(e) => {
                           if (e.key === "Enter") {
                             e.preventDefault();
                            const idx = blocks.findIndex(b => b.id === block.id);
                            const nextId = newId();
                            setBlocks(prev => {
                              setHistory((old) => [JSON.parse(JSON.stringify(prev)), ...old].slice(0, 5));
                              const next = [...prev];
                              next.splice(idx + 1, 0, { id: nextId, type: "text", value: "" } as Block);
                              return next;
                            });
                            focusBlockId.current = nextId;
                          }
                        }}
                       placeholder="Texto de exemplo (placeholder)"
                       className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/20 transition-all text-sm placeholder:text-neutral-400 shadow-sm"
                       style={{ color: textColor }}
                      />
                    </div>
                   );
                 }
                if (block.type === "long-answer") {
                  return (
                  <div
                    key={block.id}
                    onFocus={() => setActiveBlockId(block.id)}
                    className="group flex flex-col gap-2 border border-transparent transition-colors"
                  >
                    <textarea
                      ref={(el) => {
                        if (el) textareaRefs.current[block.id] = el as any;
                      }}
                      value={block.placeholder}
                      onChange={(e) => updateBlock(block.id, { placeholder: e.target.value } as Partial<Block>)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const idx = blocks.findIndex(b => b.id === block.id);
                          const nextId = newId();
                          setBlocks(prev => {
                            const next = [...prev];
                            next.splice(idx + 1, 0, { id: nextId, type: "text", value: "" } as Block);
                            return next;
                          });
                          focusBlockId.current = nextId;
                        }
                      }}
                      placeholder="Texto de exemplo (placeholder)"
                      rows={4}
                      className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/20 transition-all text-sm placeholder:text-neutral-400 resize-none min-h-24 shadow-sm"
                      style={{ color: textColor }}
                    />
                  </div>
                  );
                }
                if (block.type === "checkboxes") {
                  return (
                    <div key={block.id} onFocus={() => setActiveBlockId(block.id)} className="group w-full space-y-2">
                      {block.options.map((opt, oi) => (
                        <div
                          key={opt.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-white border border-neutral-100 shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = block.options.map((o) =>
                                o.id === opt.id ? { ...o, checked: !o.checked } : o
                              );
                              updateBlock(block.id, { options: newOpts } as Partial<Block>);
                            }}
                            aria-label={opt.checked ? "Desmarcar" : "Marcar"}
                             className={`flex items-center justify-center w-4 h-4 rounded-sm border transition-colors workspace-accent-border ${
                              opt.checked
                                 ? "workspace-accent-bg text-white"
                                 : "bg-transparent border-neutral-300 hover:border-neutral-400"
                            }`}
                            style={{ backgroundColor: opt.checked ? "var(--accent-color)" : undefined, borderColor: opt.checked ? "var(--accent-color)" : undefined }}
                          >
                            {opt.checked && (
                              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 8 7 12 13 4" />
                              </svg>
                            )}
                          </button>
                          <input
                            type="text"
                            ref={(el) => {
                              if (el && oi === block.options.length - 1) {
                                textareaRefs.current[block.id] = el as any;
                              }
                            }}
                            value={opt.value}
                            onChange={(e) => {
                              const newOpts = block.options.map((o) =>
                                o.id === opt.id ? { ...o, value: e.target.value } : o
                              );
                              updateBlock(block.id, { options: newOpts } as Partial<Block>);
                            }}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") {
                                 e.preventDefault();
                                 const newOpts = [...block.options];
                                 const currentIdx = newOpts.findIndex(o => o.id === opt.id);
                                 newOpts.splice(currentIdx + 1, 0, { id: newId(), value: "", checked: false });
                                 updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                 
                                 setTimeout(() => {
                                   const parent = blockRefs.current[block.id];
                                   const inputs = parent?.querySelectorAll('input[type="text"]');
                                   if (inputs && inputs[currentIdx + 1]) {
                                     (inputs[currentIdx + 1] as HTMLElement).focus();
                                     (inputs[currentIdx + 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                                   }
                                 }, 0);
                               } else if (e.key === "Backspace") {
                                 const target = e.target as HTMLInputElement;
                                 if (target.value === "") {
                                   e.preventDefault();
                                   e.stopPropagation();
                                   if (block.options.length > 1) {
                                     const currentIdx = block.options.findIndex(o => o.id === opt.id);
                                     const newOpts = block.options.filter(o => o.id !== opt.id);
                                     updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                     
                                     setTimeout(() => {
                                       const parent = blockRefs.current[block.id];
                                       const inputs = parent?.querySelectorAll('input[type="text"]');
                                       const focusIdx = Math.max(0, currentIdx - 1);
                                       if (inputs && inputs[focusIdx]) (inputs[focusIdx] as HTMLElement).focus();
                                     }, 0);
                                   } else {
                                     removeBlock(block.id);
                                   }
                                 } else {
                                   e.stopPropagation();
                                 }
                               }
                             }}
                            placeholder={`Opção ${oi + 1}`}
                            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-neutral-400 font-medium"
                            style={{ color: textColor }}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const newOpts = [...block.options, { id: newId(), value: "", checked: false }];
                          updateBlock(block.id, { options: newOpts } as Partial<Block>);
                        }}
                        className="flex items-center gap-2 w-full border border-dashed border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left mt-2"
                      >
                        <span className="flex items-center justify-center w-4 h-4 rounded-sm border border-neutral-300 bg-white" />
                        <span className="text-sm text-neutral-400">Adicionar opção</span>
                      </button>
                    </div>
                  );
                }
                // multiple-choice
                if (block.type === "dropdown") {
                  const isOpen = openDropdownId === block.id;
                  const selected = block.options.find((o) => o.id === block.selectedId) ?? null;
                  return (
                    <div key={block.id} onFocus={() => setActiveBlockId(block.id)} className="group w-full space-y-2 relative">
                       <button
                         type="button"
                         ref={(el) => {
                           if (el) textareaRefs.current[block.id] = el as any;
                         }}
                         onClick={() => setOpenDropdownId(isOpen ? null : block.id)}
                         onKeyDown={(e) => {
                           if (e.key === "Enter") {
                             setOpenDropdownId(isOpen ? null : block.id);
                           }
                         }}
                          className="flex items-center justify-between gap-2 w-full border border-neutral-200 rounded-lg px-4 py-3 bg-white hover:border-neutral-300 transition-all text-left outline-none focus:ring-2 focus:ring-pink-500/20 shadow-sm"
                        >
                          <span 
                            className="text-sm"
                            style={{ color: selected && selected.value ? textColor : "#A3A3A3" }}
                          >
                            {selected && selected.value ? selected.value : "Selecione uma opção"}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                      {isOpen && (
                        <div className="w-full border border-neutral-100 rounded-md bg-white shadow-sm p-2 space-y-1.5">
                          {block.options.map((opt, oi) => (
                            <div
                              key={opt.id}
                              className={`flex items-center gap-2 w-full border rounded-lg px-3 py-2 transition-colors cursor-pointer ${
                                block.selectedId === opt.id
                                  ? "border-blue-400 bg-blue-50/50"
                                  : "border-neutral-200 bg-neutral-50/50 hover:border-neutral-300"
                              }`}
                              onClick={() => updateBlock(block.id, { selectedId: opt.id } as Partial<Block>)}
                            >
                              <input
                                type="text"
                                value={opt.value}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const newOpts = block.options.map((o) =>
                                    o.id === opt.id ? { ...o, value: e.target.value } : o
                                  );
                                  updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                }}
                                 onKeyDown={(e) => {
                                    if (e.key === "Backspace") {
                                      const target = e.target as HTMLInputElement;
                                      if (target.value === "") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (block.options.length > 1) {
                                          const currentIdx = block.options.findIndex(o => o.id === opt.id);
                                          const newOpts = block.options.filter(o => o.id !== opt.id);
                                          const updateData: Partial<Block> = { options: newOpts };
                                          if (block.selectedId === opt.id) {
                                            (updateData as any).selectedId = null;
                                          }
                                          updateBlock(block.id, updateData);
                                          
                                          setTimeout(() => {
                                            const parent = blockRefs.current[block.id];
                                            const inputs = parent?.querySelectorAll('input[type="text"]');
                                            const focusIdx = Math.max(0, currentIdx - 1);
                                            if (inputs && inputs[focusIdx]) (inputs[focusIdx] as HTMLElement).focus();
                                          }, 0);
                                        } else {
                                          removeBlock(block.id);
                                        }
                                      } else {
                                        e.stopPropagation();
                                      }
                                   } else if (e.key === "Enter") {
                                      e.preventDefault();
                                      const newOpts = [...block.options];
                                      const currentIdx = newOpts.findIndex(o => o.id === opt.id);
                                      newOpts.splice(currentIdx + 1, 0, { id: newId(), value: "" });
                                      updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                      
                                      setTimeout(() => {
                                        const parent = blockRefs.current[block.id];
                                        const inputs = parent?.querySelectorAll('input[type="text"]');
                                        if (inputs && inputs[currentIdx + 1]) {
                                          (inputs[currentIdx + 1] as HTMLElement).focus();
                                          (inputs[currentIdx + 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }
                                      }, 0);
                                   }
                                 }}
                                placeholder={`Opção ${oi + 1}`}
                                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-neutral-400"
                                style={{ color: textColor }}
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newOpts = [...block.options, { id: newId(), value: "" }];
                              updateBlock(block.id, { options: newOpts } as Partial<Block>);
                            }}
                            className="flex items-center gap-2 w-full border border-dashed border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left mt-2"
                          >
                            <span className="text-sm text-neutral-400">Adicionar opção</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                if (block.type === "multi-select") {
                  const isOpen = openDropdownId === block.id;
                  const colorPalette = [
                    { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
                    { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
                    { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
                    { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
                    { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
                    { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-200" },
                    { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200" },
                    { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
                  ];
                  const colorFor = (optId: string) => {
                    const idx = block.options.findIndex((o) => o.id === optId);
                    return colorPalette[idx % colorPalette.length];
                  };
                  const selectedOpts = block.selectedIds
                    .map((id) => block.options.find((o) => o.id === id))
                    .filter((o): o is { id: string; value: string } => Boolean(o));
                  const toggleSelected = (optId: string) => {
                    const exists = block.selectedIds.includes(optId);
                    const newSelected = exists
                      ? block.selectedIds.filter((id) => id !== optId)
                      : [...block.selectedIds, optId];
                    updateBlock(block.id, { selectedIds: newSelected } as Partial<Block>);
                  };
                  return (
                    <div key={block.id} onFocus={() => setActiveBlockId(block.id)} className="group w-full space-y-2 relative">
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) textareaRefs.current[block.id] = el as any;
                        }}
                        onClick={() => setOpenDropdownId(isOpen ? null : block.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setOpenDropdownId(isOpen ? null : block.id);
                          }
                        }}
                        className="flex items-center justify-between gap-2 w-full border border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 transition-colors text-left min-h-[40px] outline-none focus:ring-2 focus:ring-pink-500/20"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 flex-1">
                          {selectedOpts.length === 0 ? (
                            <span className="text-sm text-neutral-400">Selecione uma ou mais opções</span>
                          ) : (
                            selectedOpts.map((opt) => {
                              const c = colorFor(opt.id);
                              return (
                                <span
                                  key={opt.id}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
                                >
                                  {opt.value}
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelected(opt.id);
                                    }}
                                    className="cursor-pointer hover:opacity-70"
                                    aria-label="Remover"
                                  >
                                    ×
                                  </span>
                                </span>
                              );
                            })
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="w-full border border-neutral-200 rounded-md bg-white shadow-sm p-2 space-y-2">
                          {block.options.map((opt, oi) => {
                            const c = colorFor(opt.id);
                            const isSelected = block.selectedIds.includes(opt.id);
                            return (
                              <div
                                key={opt.id}
                                onClick={() => toggleSelected(opt.id)}
                                className={`flex items-center gap-2 w-full border rounded-md px-3 py-2 cursor-pointer transition-colors ${
                                  isSelected ? `${c.bg} ${c.border}` : `${c.bg} ${c.border} opacity-50 grayscale-[0.5] hover:opacity-100 hover:grayscale-0`
                                }`}
                              >
                                <input
                                  type="text"
                                  value={opt.value}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const newOpts = block.options.map((o) =>
                                      o.id === opt.id ? { ...o, value: e.target.value } : o
                                    );
                                    updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                  }}
                                   onKeyDown={(e) => {
                                     if (e.key === "Backspace") {
                                       const target = e.target as HTMLInputElement;
                                       if (target.value === "") {
                                         e.preventDefault();
                                         e.stopPropagation();
                                         if (block.options.length > 1) {
                                           const currentIdx = block.options.findIndex(o => o.id === opt.id);
                                           const newOpts = block.options.filter(o => o.id !== opt.id);
                                           const newSelected = block.selectedIds.filter((id) => id !== opt.id);
                                           updateBlock(block.id, { options: newOpts, selectedIds: newSelected } as Partial<Block>);
                                           
                                           setTimeout(() => {
                                             const parent = blockRefs.current[block.id];
                                             const inputs = parent?.querySelectorAll('input[type="text"]');
                                             const focusIdx = Math.max(0, currentIdx - 1);
                                             if (inputs && inputs[focusIdx]) (inputs[focusIdx] as HTMLElement).focus();
                                           }, 0);
                                         } else {
                                           removeBlock(block.id);
                                         }
                                       } else {
                                         e.stopPropagation();
                                       }
                                     } else if (e.key === "Enter") {
                                       e.preventDefault();
                                       const newOpts = [...block.options];
                                       const currentIdx = newOpts.findIndex(o => o.id === opt.id);
                                       newOpts.splice(currentIdx + 1, 0, { id: newId(), value: "" });
                                       updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                       
                                       setTimeout(() => {
                                         const parent = blockRefs.current[block.id];
                                         const inputs = parent?.querySelectorAll('input[type="text"]');
                                         if (inputs && inputs[currentIdx + 1]) {
                                           (inputs[currentIdx + 1] as HTMLElement).focus();
                                           (inputs[currentIdx + 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                                         }
                                       }, 0);
                                     }
                                   }}
                                  placeholder={`Opção ${oi + 1}`}
                                  className={`flex-1 bg-transparent border-none outline-none text-sm placeholder:text-neutral-400`}
                                  style={{ color: isSelected ? undefined : textColor }}
                                />
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newOpts = [...block.options, { id: newId(), value: "" }];
                              updateBlock(block.id, { options: newOpts } as Partial<Block>);
                            }}
                            className="flex items-center gap-2 w-full border border-dashed border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left mt-2"
                          >
                            <span className="text-sm text-neutral-400">Adicionar opção</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                if (block.type === "ranking") {
                  const selectedOpts = block.selectedIds
                    .map((id) => block.options.find((o) => o.id === id))
                    .filter((o): o is { id: string; value: string } => Boolean(o));

                  const toggleRanking = (optId: string) => {
                    const exists = block.selectedIds.includes(optId);
                    const newSelected = exists
                      ? block.selectedIds.filter((id) => id !== optId)
                      : [...block.selectedIds, optId];
                    updateBlock(block.id, { selectedIds: newSelected } as Partial<Block>);
                  };

                   return (
                     <div 
                       key={block.id} 
                       ref={(el) => {
                         if (el) textareaRefs.current[block.id] = el as any;
                       }}
                       tabIndex={0}
                       onFocus={() => setActiveBlockId(block.id)}
                       onKeyDown={(e) => {
                         if (e.key === "Backspace") {
                           e.preventDefault();
                           removeBlock(block.id);
                         }
                       }}
                       className="w-full space-y-2 outline-none"
                     >
                       {[...selectedOpts, ...block.options.filter((o) => !block.selectedIds.includes(o.id))].map((opt, oi) => {
                        const isSelected = block.selectedIds.includes(opt.id);
                        const rankIndex = block.selectedIds.indexOf(opt.id);
                        return (
                          <div
                            key={opt.id}
                            onClick={() => toggleRanking(opt.id)}
                            className={`flex items-center gap-2 w-full border rounded-md px-3 py-2 cursor-pointer transition-all duration-300 workspace-accent-border ${
                              isSelected
                                ? "bg-opacity-10 shadow-sm"
                                : "border-neutral-200 bg-white hover:border-neutral-300"
                            }`}
                            style={{ backgroundColor: isSelected ? "var(--accent-color)" : undefined, borderColor: isSelected ? "var(--accent-color)" : undefined }}
                          >
                            <div className={`flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold transition-colors workspace-accent-border ${
                              isSelected 
                                ? "workspace-accent-bg text-white" 
                                : "border-neutral-200 bg-white text-neutral-400"
                            }`}>
                              {isSelected ? rankIndex + 1 : ""}
                            </div>
                            <input
                              type="text"
                              ref={(el) => {
                                if (el && oi === block.options.length - 1) {
                                  textareaRefs.current[block.id] = el as any;
                                }
                              }}
                              value={opt.value}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const newOpts = block.options.map((o) =>
                                  o.id === opt.id ? { ...o, value: e.target.value } : o
                                );
                                updateBlock(block.id, { options: newOpts } as Partial<Block>);
                              }}
                               onKeyDown={(e) => {
                                 if (e.key === "Backspace") {
                                   const target = e.target as HTMLInputElement;
                                   if (target.value === "") {
                                     e.preventDefault();
                                     e.stopPropagation();
                                     if (block.options.length > 1) {
                                       const currentIdx = block.options.findIndex(o => o.id === opt.id);
                                       const newOpts = block.options.filter(o => o.id !== opt.id);
                                       updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                       
                                       setTimeout(() => {
                                         const parent = blockRefs.current[block.id];
                                         const inputs = parent?.querySelectorAll('input[type="text"]');
                                         const focusIdx = Math.max(0, currentIdx - 1);
                                         if (inputs && inputs[focusIdx]) (inputs[focusIdx] as HTMLElement).focus();
                                       }, 0);
                                     } else {
                                       removeBlock(block.id);
                                     }
                                   } else {
                                     e.stopPropagation();
                                   }
                                 } else if (e.key === "Enter") {
                                   e.preventDefault();
                                   const newOpts = [...block.options];
                                   const currentIdx = newOpts.findIndex(o => o.id === opt.id);
                                   newOpts.splice(currentIdx + 1, 0, { id: newId(), value: "" });
                                   updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                   
                                   setTimeout(() => {
                                     const parent = blockRefs.current[block.id];
                                     const inputs = parent?.querySelectorAll('input[type="text"]');
                                     if (inputs && inputs[currentIdx + 1]) {
                                       (inputs[currentIdx + 1] as HTMLElement).focus();
                                       (inputs[currentIdx + 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                                     }
                                   }, 0);
                                 }
                               }}
                              placeholder={`Opção ${oi + 1}`}
                              className="flex-1 bg-transparent border-none outline-none text-sm text-neutral-700 placeholder:text-neutral-400"
                            />
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          const newOpts = [...block.options, { id: newId(), value: "" }];
                          updateBlock(block.id, { options: newOpts } as Partial<Block>);
                        }}
                        className="flex items-center gap-2 w-full border border-dashed border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left mt-2"
                      >
                        <span className="text-sm text-neutral-400">Adicionar opção</span>
                      </button>
                    </div>
                  );
                }
                if (block.type === "file-upload") {
                  return (
                    <div
                      key={block.id}
                      ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace") {
                          e.preventDefault();
                          removeBlock(block.id);
                        }
                      }}
                      className="group w-full outline-none"
                    >
                      <div
                        aria-disabled
                        className="relative w-full h-16 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50/50 dark:bg-neutral-800/50 flex items-center px-4 overflow-hidden select-none"
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                            <Upload className="w-4 h-4" style={{ color: textColor }} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium" style={{ color: textColor }}>Selecionar arquivo</span>
                            <span className="text-[10px] text-neutral-400">Toque para escolher do dispositivo</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (block.type === "linear-scale") {
                  return (
                    <div 
                      key={block.id} 
                      ref={(el) => {
                        if (el) textareaRefs.current[block.id] = el as any;
                      }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={() => {}}
                      className="group w-full outline-none"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {Array.from({ length: 11 }, (_, n) => {
                          const isSelected = block.selected === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, { selected: isSelected ? null : n } as Partial<Block>)
                              }
                              className={`flex items-center justify-center w-10 h-10 rounded-md border text-sm font-medium transition-colors workspace-accent-border ${
                                isSelected
                                  ? "bg-white text-neutral-700 ring-2"
                                  : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300"
                              }`}
                              style={{ borderColor: isSelected ? "var(--accent-color)" : undefined, boxShadow: isSelected ? "0 0 0 2px var(--accent-color)" : undefined }}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                if (block.type === "matrix") {
                  return (
                    <div key={block.id} className="group w-full space-y-2">
                      <div className="overflow-x-auto border border-neutral-200 rounded-md bg-white">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr>
                              <th className="border-b border-r border-neutral-200 p-2"></th>
                              {block.columns.map((col, idx) => (
                                <th key={col.id} className="border-b border-r border-neutral-200 last:border-r-0 p-2">
                                  <input
                                    type="text"
                                    ref={(el) => {
                                      if (el && idx === 0) {
                                        textareaRefs.current[block.id] = el as any;
                                      }
                                    }}
                                    value={col.label}
                                    onChange={(e) => {
                                      const newCols = block.columns.map((c) =>
                                        c.id === col.id ? { ...c, label: e.target.value } : c
                                      );
                                      updateBlock(block.id, { columns: newCols } as Partial<Block>);
                                    }}
                                    onKeyDown={() => {}}
                                    className="w-full bg-transparent border-none outline-none text-center text-sm placeholder:text-neutral-400"
                                    style={{ color: textColor }}
                                  />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row) => (
                              <tr key={row.id}>
                                <td className="border-t border-r border-neutral-200 p-2 w-32">
                                  <input
                                    type="text"
                                    value={row.label}
                                    onChange={(e) => {
                                      const newRows = block.rows.map((r) =>
                                        r.id === row.id ? { ...r, label: e.target.value } : r
                                      );
                                      updateBlock(block.id, { rows: newRows } as Partial<Block>);
                                    }}
                                    className="w-full bg-transparent border-none outline-none text-sm placeholder:text-neutral-400"
                                    style={{ color: textColor }}
                                  />
                                </td>
                                {block.columns.map((col) => {
                                  const selected = block.selections[row.id] === col.id;
                                  return (
                                    <td
                                      key={col.id}
                                      className="border-t border-r border-neutral-200 last:border-r-0 p-2 text-center"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newSel = { ...block.selections };
                                          if (selected) {
                                            delete newSel[row.id];
                                          } else {
                                            newSel[row.id] = col.id;
                                          }
                                          updateBlock(block.id, { selections: newSel } as Partial<Block>);
                                        }}
                                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors ${
                                          selected
                                            ? "border-neutral-700"
                                            : "border-neutral-300 hover:border-neutral-400"
                                        }`}
                                        aria-label="Selecionar"
                                      >
                                        {selected && <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(block.id, {
                              rows: [
                                ...block.rows,
                                { id: newId(), label: `Linha ${block.rows.length + 1}` },
                              ],
                            } as Partial<Block>)
                          }
                          className="text-xs text-neutral-500 hover:text-neutral-700 border border-dashed border-neutral-200 rounded-md px-3 py-1.5 hover:border-neutral-300"
                        >
                          + Linha
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(block.id, {
                              columns: [
                                ...block.columns,
                                { id: newId(), label: `Coluna ${block.columns.length + 1}` },
                              ],
                            } as Partial<Block>)
                          }
                          className="text-xs text-neutral-500 hover:text-neutral-700 border border-dashed border-neutral-200 rounded-md px-3 py-1.5 hover:border-neutral-300"
                        >
                          + Coluna
                        </button>
                      </div>
                    </div>
                  );
                }
                if (block.type === "rating") {
                  return (
                    <div 
                      key={block.id} 
                      ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={() => {}}
                      className="outline-none"
                    >
                      <RatingStars
                        value={block.value}
                        onChange={(v) => updateBlock(block.id, { value: v } as Partial<Block>)}
                      />
                    </div>
                  );
                }
                if (block.type === "signature") {
                  return (
                    <div 
                      key={block.id} 
                      ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={() => {}}
                      className="outline-none"
                    >
                      <SignaturePad
                        dataUrl={block.dataUrl}
                        onChange={(v) => updateBlock(block.id, { dataUrl: v } as Partial<Block>)}
                      />
                    </div>
                  );
                }
                if (block.type === "page-break") {
                  const pageNum =
                    blocks.slice(0, blocks.findIndex((b) => b.id === block.id) + 1)
                      .filter((b) => b.type === "page-break").length + 1;
                  return (
                    <div key={block.id} className="w-full flex items-center gap-3 py-2 text-neutral-400 text-sm">
                      <div className="flex-1 h-px bg-neutral-200" />
                      <span className="whitespace-nowrap">{`Página ${pageNum}`}</span>
                      <div className="flex-1 h-px bg-neutral-200" />
                      <ChevronDown className="w-4 h-4 shrink-0 text-neutral-600" strokeWidth={2.5} />
                    </div>
                  );
                }
                if (
                  block.type === "heading-1" ||
                  block.type === "heading-2" ||
                  block.type === "heading-3" ||
                  block.type === "observation" ||
                  block.type === "label"
                ) {
                  const sizeClass =
                    block.type === "heading-1"
                      ? "text-5xl font-bold"
                      : block.type === "heading-2"
                        ? "text-4xl font-bold"
                        : block.type === "heading-3"
                          ? "text-3xl font-bold"
                          : block.type === "observation"
                            ? "text-2xl font-bold"
                            : "text-xl font-medium";
                  const placeholderText =
                    block.type === "heading-1"
                      ? "Título 1"
                      : block.type === "heading-2"
                        ? "Título 2"
                        : block.type === "heading-3"
                          ? "Título 3"
                          : block.type === "observation"
                            ? "Observação"
                            : "Rótulo";
                  return (
                    <input
                      key={block.id}
                      ref={(el) => {
                        if (el) textareaRefs.current[block.id] = el as any;
                      }}
                      type="text"
                      onFocus={() => setActiveBlockId(block.id)}
                      value={block.value}
                      onChange={(e) => updateBlock(block.id, { value: e.target.value } as Partial<Block>)}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace") {
                          const target = e.target as HTMLInputElement;
                          if (target.selectionStart === 0 && target.selectionEnd === 0) {
                            e.preventDefault();
                            removeBlock(block.id);
                          }
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          const idx = blocks.findIndex(b => b.id === block.id);
                          const nextId = newId();
                          setBlocks(prev => {
                            const next = [...prev];
                            next.splice(idx + 1, 0, { id: nextId, type: "text", value: "" } as Block);
                            return next;
                          });
                          focusBlockId.current = nextId;
                        }
                      }}
                      placeholder={placeholderText}
                      className={`w-full bg-transparent border-none outline-none placeholder:text-neutral-300 ${sizeClass}`}
                      style={{ color: textColor }}
                    />
                  );
                }
                if (block.type === "divider") {
                  return (
                    <div 
                      key={block.id} 
                      ref={(el) => {
                        if (el) textareaRefs.current[block.id] = el as any;
                      }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const idx = blocks.findIndex(b => b.id === block.id);
                          const nextId = newId();
                          setBlocks(prev => {
                            const next = [...prev];
                            next.splice(idx + 1, 0, { id: nextId, type: "text", value: "" } as Block);
                            return next;
                          });
                          focusBlockId.current = nextId;
                        }
                      }}
                      className="group relative w-full py-2 outline-none focus:bg-neutral-50 rounded"
                    >
                      <div className="h-px w-full bg-neutral-200" />
                    </div>
                  );
                }
                 if (block.type === "image" && !block.variant) {
                   return (
                    <div
                      key={block.id}
                      ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={() => {}}
                      className="outline-none"
                    >
                      <div
                        aria-disabled
                        className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-neutral-200 rounded-md px-4 py-8 bg-neutral-50/50 select-none"
                      >
                        <div className="flex items-center gap-2 text-neutral-500">
                          <Upload className="w-5 h-5" />
                          <span className="text-sm font-medium">Upload de imagem (preenchido pelo usuário)</span>
                        </div>
                        <span className="text-xs text-neutral-400">
                          Disponível na pré-visualização e no checklist publicado.
                        </span>
                      </div>
                    </div>
                   );
                 }
                if (block.type === "video") {
                  return (
                    <div 
                      key={block.id} 
                      ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={() => {}}
                      className="outline-none"
                    >
                      <VideoBlock
                        src={block.src}
                        onChange={(src) => updateBlock(block.id, { src } as Partial<Block>)}
                        onRemove={() => removeBlock(block.id)}
                      />
                    </div>
                  );
                }
                 if (block.type === "embed") {
                   return (
                    <div 
                      key={block.id} 
                      ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                      tabIndex={0}
                      onFocus={() => setActiveBlockId(block.id)}
                      onKeyDown={() => {}}
                      className="outline-none"
                    >
                      <EmbedBlock
                        src={block.src}
                        onChange={(src) => updateBlock(block.id, { src } as Partial<Block>)}
                        onRemove={() => removeBlock(block.id)}
                      />
                    </div>
                   );
                 }
                 if (block.type === "task-list") {
                   return (
                     <div key={block.id} onFocus={() => setActiveBlockId(block.id)} className="group w-full space-y-2">
                       {block.options.map((opt, oi) => (
                         <div key={opt.id} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-neutral-100 shadow-sm">
                           <button
                             type="button"
                             onClick={() => {
                               const newOpts = block.options.map((o) => o.id === opt.id ? { ...o, checked: !o.checked } : o);
                               updateBlock(block.id, { options: newOpts } as Partial<Block>);
                             }}
                             className="flex items-center justify-center w-4 h-4 rounded-sm border transition-colors"
                             style={{ backgroundColor: opt.checked ? "var(--accent-color)" : undefined, borderColor: opt.checked ? "var(--accent-color)" : "#d4d4d4" }}
                           >
                             {opt.checked && (
                               <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                 <polyline points="3 8 7 12 13 4" />
                               </svg>
                             )}
                           </button>
                           <input
                             type="text"
                             ref={(el) => { if (el && oi === block.options.length - 1) textareaRefs.current[block.id] = el as any; }}
                             value={opt.value}
                             onChange={(e) => {
                               const newOpts = block.options.map((o) => o.id === opt.id ? { ...o, value: e.target.value } : o);
                               updateBlock(block.id, { options: newOpts } as Partial<Block>);
                             }}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") {
                                 e.preventDefault();
                                 const newOpts = [...block.options];
                                 const ci = newOpts.findIndex(o => o.id === opt.id);
                                 newOpts.splice(ci + 1, 0, { id: newId(), value: "", checked: false });
                                 updateBlock(block.id, { options: newOpts } as Partial<Block>);
                               }
                             }}
                             placeholder={`Tarefa ${oi + 1}`}
                             className={`flex-1 bg-transparent border-none outline-none text-sm placeholder:text-neutral-400 ${opt.checked ? "line-through text-neutral-400" : ""}`}
                             style={{ color: opt.checked ? undefined : textColor }}
                           />
                         </div>
                       ))}
                       <button
                         type="button"
                         onClick={() => {
                           const newOpts = [...block.options, { id: newId(), value: "", checked: false }];
                           updateBlock(block.id, { options: newOpts } as Partial<Block>);
                         }}
                         className="flex items-center gap-2 w-full border border-dashed border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left"
                       >
                         <Plus className="w-4 h-4 text-neutral-400" />
                         <span className="text-sm text-neutral-400">Adicionar tarefa</span>
                       </button>
                     </div>
                   );
                 }
                 if (block.type === "counter") {
                   return (
                     <div
                       key={block.id}
                       ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                       tabIndex={0}
                       onFocus={() => setActiveBlockId(block.id)}
                       className="flex items-center gap-3 p-3 rounded-lg bg-white border border-neutral-200 shadow-sm w-fit outline-none"
                     >
                       <button
                         type="button"
                         onClick={() => updateBlock(block.id, { value: Math.max(block.min, block.value - block.step) } as Partial<Block>)}
                         className="w-9 h-9 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center text-lg font-semibold text-neutral-700"
                       >
                         −
                       </button>
                       <input
                         type="number"
                         value={block.value}
                         onChange={(e) => updateBlock(block.id, { value: Number(e.target.value) || 0 } as Partial<Block>)}
                         className="w-20 text-center text-lg font-semibold bg-transparent border-none outline-none"
                         style={{ color: textColor }}
                       />
                       <button
                         type="button"
                         onClick={() => updateBlock(block.id, { value: Math.min(block.max, block.value + block.step) } as Partial<Block>)}
                         className="w-9 h-9 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center text-lg font-semibold text-neutral-700"
                       >
                         +
                       </button>
                     </div>
                   );
                 }
                 if (block.type === "currency") {
                   return (
                     <div key={block.id} onFocus={() => setActiveBlockId(block.id)} className="group flex flex-col gap-2">
                       <div className="flex items-center w-full bg-white border border-neutral-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-pink-500/20">
                         <span className="pl-4 pr-2 text-neutral-500 text-sm font-medium select-none">{block.currency}</span>
                         <input
                           type="text"
                           ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                           value={block.placeholder}
                           onChange={(e) => updateBlock(block.id, { placeholder: e.target.value } as Partial<Block>)}
                           placeholder="0,00"
                           className="flex-1 bg-transparent border-none outline-none px-2 py-3 text-sm placeholder:text-neutral-400"
                           style={{ color: textColor }}
                         />
                       </div>
                     </div>
                   );
                 }
                 if (block.type === "audio") {
                   return (
                     <div
                       key={block.id}
                       ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                       tabIndex={0}
                       onFocus={() => setActiveBlockId(block.id)}
                       className="outline-none p-4 rounded-lg bg-white border border-neutral-200 shadow-sm"
                     >
                       {block.src ? (
                         <div className="flex items-center gap-3">
                           <audio src={block.src} controls className="flex-1" />
                           <button
                             type="button"
                             onClick={() => updateBlock(block.id, { src: null } as Partial<Block>)}
                             className="text-xs text-neutral-500 hover:text-neutral-700"
                           >
                             Remover
                           </button>
                         </div>
                       ) : (
                         <label className="flex items-center gap-3 cursor-pointer text-neutral-500 hover:text-neutral-700">
                           <Mic className="w-5 h-5" />
                           <span className="text-sm">Enviar arquivo de áudio</span>
                           <input
                             type="file"
                             accept="audio/*"
                             className="hidden"
                             onChange={(e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 const url = URL.createObjectURL(file);
                                 updateBlock(block.id, { src: url } as Partial<Block>);
                               }
                             }}
                           />
                         </label>
                       )}
                     </div>
                   );
                 }
                 if (block.type === "qr-code") {
                   const qrSrc = block.value
                     ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(block.value)}`
                     : null;
                   return (
                     <div
                       key={block.id}
                       ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                       tabIndex={0}
                       onFocus={() => setActiveBlockId(block.id)}
                       className="outline-none p-4 rounded-lg bg-white border border-neutral-200 shadow-sm flex flex-col items-center gap-3"
                     >
                       <input
                         type="text"
                         value={block.value}
                         onChange={(e) => updateBlock(block.id, { value: e.target.value } as Partial<Block>)}
                         placeholder="Texto ou URL para gerar QR Code"
                         className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/20 text-sm placeholder:text-neutral-400"
                         style={{ color: textColor }}
                       />
                       {qrSrc ? (
                         <img src={qrSrc} alt="QR Code" className="w-40 h-40" />
                       ) : (
                         <div className="w-40 h-40 flex items-center justify-center text-neutral-300">
                           <QrCode className="w-16 h-16" />
                         </div>
                       )}
                     </div>
                   );
                 }
                 if (block.type === "multiple-choice") {
                   return (
                      <div key={block.id} onFocus={() => setActiveBlockId(block.id)} className="group w-full space-y-2">
                       {block.options.map((opt, oi) => (
                      <div
                        key={opt.id}
                        className="flex items-center gap-2 w-full border border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 transition-colors"
                      >
                        <span 
                          className="flex items-center justify-center w-6 h-6 rounded workspace-accent-bg text-white text-xs font-semibold"
                          style={{ backgroundColor: "var(--accent-color)" }}
                        >
                          {String.fromCharCode(65 + oi)}
                        </span>
                         <input
                           type="text"
                           ref={(el) => {
                             if (el && oi === block.options.length - 1) {
                               textareaRefs.current[block.id] = el as any;
                             }
                           }}
                           value={opt.value}
                           onChange={(e) => {
                             const newOpts = block.options.map((o) =>
                               o.id === opt.id ? { ...o, value: e.target.value } : o
                             );
                             updateBlock(block.id, { options: newOpts } as Partial<Block>);
                           }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const newOpts = [...block.options];
                                const currentIdx = newOpts.findIndex(o => o.id === opt.id);
                                newOpts.splice(currentIdx + 1, 0, { id: newId(), value: "" });
                                updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                
                                setTimeout(() => {
                                  const parent = blockRefs.current[block.id];
                                  const inputs = parent?.querySelectorAll('input[type="text"]');
                                  if (inputs && inputs[currentIdx + 1]) {
                                    (inputs[currentIdx + 1] as HTMLElement).focus();
                                    (inputs[currentIdx + 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }
                                }, 0);
                              } else if (e.key === "Backspace") {
                                const target = e.target as HTMLInputElement;
                                if (target.value === "") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (block.options.length > 1) {
                                    const currentIdx = block.options.findIndex(o => o.id === opt.id);
                                    const newOpts = block.options.filter(o => o.id !== opt.id);
                                    updateBlock(block.id, { options: newOpts } as Partial<Block>);
                                    
                                    setTimeout(() => {
                                      const parent = blockRefs.current[block.id];
                                      const inputs = parent?.querySelectorAll('input[type="text"]');
                                      const focusIdx = Math.max(0, currentIdx - 1);
                                      if (inputs && inputs[focusIdx]) (inputs[focusIdx] as HTMLElement).focus();
                                    }, 0);
                                  } else {
                                    removeBlock(block.id);
                                  }
                                } else {
                                  e.stopPropagation();
                                }
                              }
                            }}
                           placeholder={`Opção ${oi + 1}`}
                           className="flex-1 bg-neutral-50/50 border border-neutral-200 rounded-lg px-4 py-2 outline-none focus:border-neutral-300 transition-all text-sm placeholder:text-neutral-400"
                           style={{ color: textColor }}
                         />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const newOpts = [...block.options, { id: newId(), value: "" }];
                        updateBlock(block.id, { options: newOpts } as Partial<Block>);
                      }}
                      className="flex items-center gap-2 w-full border border-dashed border-neutral-200 rounded-md px-3 py-2 bg-white hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded bg-neutral-200 text-neutral-500 text-xs font-semibold" style={{ backgroundColor: theme === "Escuro" ? "#404040" : "#e5e5e5", color: theme === "Escuro" ? "#a3a3a3" : "#737373" }}>
                        {String.fromCharCode(65 + block.options.length)}
                      </span>
                      <span className="text-sm text-neutral-400" style={{ color: theme === "Escuro" ? "#737373" : "#a3a3a3" }}>Add option</span>
                    </button>
                  </div>
                   );
                 }
                 if (block.type === "camera") {
                   const urls = block.dataUrls || ((block as any).dataUrl ? [(block as any).dataUrl] : []);
                   const isActive = activeBlockId === block.id;
                   const allowMultiple = (block as any).allowMultiple === true;
                   const maxPhotos = Math.max(1, Math.min(20, (block as any).maxPhotos ?? 5));
                    const camTitle = String((block as any).title || (block as any).subtitle || "");
                    const camDescription = String((block as any).description ?? "");
                     const camRequired = (block as any).required !== false;
                    const camGuidance = String((block as any).captureGuidance ?? "");
                    const camOrientation = ((block as any).orientation as "any" | "portrait" | "landscape" | undefined) ?? "any";
                    const camPreCapture = ((block as any).preCaptureMessage as string | null | undefined) ?? "";
                    const camFraming = ((block as any).framingHint as string | null | undefined) ?? "";
                    const camDistance = ((block as any).distanceHint as string | null | undefined) ?? "";
                    const camLighting = ((block as any).lightingHint as string | null | undefined) ?? "";
                    const camRefPath = ((block as any).referenceImagePath as string | null | undefined) ?? "";
                    const camRefAlt = ((block as any).referenceImageAlt as string | null | undefined) ?? "";
                     type VisionOnAnomaly = "allow_continue" | "require_resubmit" | "block_completion" | "manual_review";
                     const normalizeOnAnomaly = (v: unknown): VisionOnAnomaly => {
                       switch (v) {
                         case "allow_continue":
                         case "require_resubmit":
                         case "block_completion":
                         case "manual_review":
                           return v;
                         case "warn":
                           return "allow_continue";
                         case "block":
                           return "block_completion";
                         default:
                           return "manual_review";
                       }
                     };
                     const camVision = ((block as any).vision ?? {}) as {
                      enabled?: boolean;
                      modelId?: string | null;
                      modelVersion?: string | null;
                      provider?: "cloudflare_workers_ai" | "manual";
                      criteria?: string[];
                      confidenceThreshold?: number | null;
                      model?: string | null;
                      threshold?: number | null;
                      minWidth?: number | null;
                      minHeight?: number | null;
                      onAnomaly?: VisionOnAnomaly | "block" | "warn";
                      onAnalysisFailure?: "allow_continue" | "manual_review" | "block_completion";
                    };
                    const camOnAnomaly = normalizeOnAnomaly(camVision.onAnomaly);
                    const camOnAnalysisFailure: "allow_continue" | "manual_review" | "block_completion" =
                      camVision.onAnalysisFailure === "allow_continue" ||
                      camVision.onAnalysisFailure === "block_completion" ||
                      camVision.onAnalysisFailure === "manual_review"
                        ? camVision.onAnalysisFailure
                        : "manual_review";
                     // Camera AI V2: análise semântica sempre ativa.
                     const visionBadge: { label: string; tone: "off" | "warn" | "active" } =
                       { label: "IA ativa", tone: "active" };
                   return (
                     <div
                       key={block.id}
                       ref={(el) => { if (el) textareaRefs.current[block.id] = el as any; }}
                       tabIndex={0}
                       onFocus={() => setActiveBlockId(block.id)}
                       onKeyDown={(e) => {
                         if (e.key === "Backspace") {
                           e.preventDefault();
                           removeBlock(block.id);
                         }
                       }}
                       className="group w-full outline-none"
                     >
                        <div
                           className={`flex items-start gap-3 w-full border border-neutral-200 rounded-xl px-4 py-3 bg-white hover:bg-neutral-50 transition-all relative group/camera-card shadow-sm`}
                          onMouseDown={(e) => {
                            if ((e.target as HTMLElement).closest('button')) return;
                            (e.currentTarget as any).__wasActive = isActive;
                          }}
                          onClick={(e) => {
                             e.stopPropagation();
                            if ((e.target as HTMLElement).closest('button')) return;
                            const wasActive = (e.currentTarget as any).__wasActive;
                            if (wasActive) {
                              setActiveBlockId(null);
                              (textareaRefs.current[block.id] as any)?.blur?.();
                            } else {
                              setActiveBlockId(block.id);
                            }
                          }}
                        >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${textColor}1A` }}>
                            <Camera className="w-5 h-5" style={{ color: textColor }} />
                          </div>
                          
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="text"
                                  value={camTitle}
                                  placeholder="Câmera"
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={() => setActiveBlockId(block.id)}
                                  onChange={(e) => updateBlock(block.id, { title: e.target.value, subtitle: e.target.value } as any)}
                                  className="flex-1 min-w-0 text-sm font-bold bg-transparent border-none outline-none placeholder:text-neutral-400"
                                  style={{ color: textColor }}
                                />
                                {allowMultiple && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 uppercase tracking-wider">
                                    até {maxPhotos}
                                  </span>
                                )}
                              </div>
                              {camDescription && (
                                <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{camDescription}</p>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                {visionBadge && (
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                      visionBadge.tone === "active"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : visionBadge.tone === "warn"
                                          ? "bg-amber-50 text-amber-700"
                                          : "bg-neutral-100 text-neutral-500"
                                    }`}
                                  >
                                    {visionBadge.label}
                                  </span>
                                )}
                              </div>
                            </div>

                          {urls.length > 0 && (
                            <div className="flex -space-x-2 overflow-hidden mr-2">
                              {urls.slice(0, 3).map((url, i) => (
                                <div key={i} className="relative w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-neutral-100 shadow-sm shrink-0 group/thumb">
                                  <img src={url} className="w-full h-full object-cover" alt={`Preview ${i}`} />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newUrls = urls.filter((_, idx) => idx !== i);
                                      updateBlock(block.id, { dataUrls: newUrls, dataUrl: newUrls[0] || null } as any);
                                    }}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity"
                                  >
                                    <Trash2 className="w-3 h-3 text-white" />
                                  </button>
                                </div>
                              ))}
                              {urls.length > 3 && (
                                <div className="w-8 h-8 rounded-full border-2 border-white bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500 shadow-sm shrink-0">
                                  +{urls.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                          <Settings
                             className={`w-4 h-4 text-neutral-400 shrink-0 mt-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover/camera-card:opacity-100'}`}
                            aria-hidden="true"
                          />
                        </div>
                        {isActive && (
                          <div
                            className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/60"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200/70">
                              <span className="text-xs font-semibold text-neutral-800 tracking-wide">
                                Configurar câmera
                              </span>
                            </div>

                            <div className="px-4 py-3 space-y-4">
                              {/* Solicitação da foto */}
                              <div className="space-y-2">
                                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                                  Pergunta
                                </label>
                                <input
                                  type="text"
                                  value={camTitle}
                                  placeholder="Ex.: Foto da bancada"
                                  onChange={(e) => updateBlock(block.id, { title: e.target.value, subtitle: e.target.value } as any)}
                                  className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md bg-white outline-none focus:border-neutral-400"
                                />
                                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider pt-1">
                                  Descrição
                                </label>
                                <textarea
                                  value={camDescription}
                                  placeholder="Detalhes ou contexto para o respondente."
                                  onChange={(e) => updateBlock(block.id, { description: e.target.value } as any)}
                                  rows={2}
                                  className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md bg-white outline-none focus:border-neutral-400 resize-y"
                                />
                              </div>

                              <CameraStandardStatus
                                checklistId={currentChecklistId || sessionChecklistIdRef.current || checklistId || null}
                                cameraBlockId={((block as any).cameraBlockId as string | undefined) ?? null}
                              />


                              {/* Regras da captura */}
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer select-none">
                                  <Switch
                                    checked={camRequired}
                                    onCheckedChange={(checked) => updateBlock(block.id, { required: checked } as any)}
                                  />
                                  <span>Foto obrigatória</span>
                                </label>
                              </div>

                            </div>
                          </div>
                        )}
                     </div>
                   );
                 }
                 return null;
                })();
                if (inner === null || inner === undefined) return null;
                
                
                return (
                  <div
                    key={block.id}
                    ref={(el) => { blockRefs.current[block.id] = el; }}
                    onFocus={() => setActiveBlockId(block.id)}
                    onClick={() => setActiveBlockId(block.id)}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setActiveBlockId(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      const interactiveTypes = ["short-answer","long-answer","multiple-choice","checkboxes","dropdown","multi-select","number","email","phone","link","file-upload","date","time","linear-scale","matrix","rating","signature","ranking","image","video","embed","divider","task-list","counter","currency","audio","qr-code","camera"];
                      if (e.key === "Backspace" && interactiveTypes.includes(block.type)) {
                        // If focus is in an input or textarea, let the block's internal handler decide
                        const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
                        if (isInput) {
                          const target = e.target as (HTMLInputElement | HTMLTextAreaElement);
                          // For blocks with multiple options, we handle deletion internally
                          const hasOptions = ["multiple-choice", "checkboxes", "dropdown", "multi-select", "ranking"].includes(block.type);
                          if (hasOptions) return;

                          // For single input types, only delete if the input is empty
                          if (target.value !== "" && target.value !== undefined) return;
                        }

                        // If it's a dropdown or multi-select, check if it's open
                        if ((block.type === "dropdown" || block.type === "multi-select") && openDropdownId === block.id) {
                          return;
                        }
                        
                        e.preventDefault();
                        e.stopPropagation();
                        removeBlock(block.id);
                      }
                    }}
                    className={`group relative flex items-start gap-1 transition-colors ${
                      draggingId === block.id ? "bg-pink-500/30 rounded-md" : ""
                    } ${
                      draggingId && dragOverId === block.id && dragOverPos === "before" && draggingId !== block.id
                        ? "before:content-[''] before:absolute before:-top-1 before:left-0 before:right-0 before:h-0.5 before:bg-blue-500 before:rounded"
                        : ""
                    } ${
                      draggingId && dragOverId === block.id && dragOverPos === "after" && draggingId !== block.id
                        ? "after:content-[''] after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500 after:rounded"
                        : ""
                    }`}
                  >
                    <div className={`absolute -left-20 top-1.5 flex items-center gap-1 transition-all duration-300 text-neutral-600 ${activeBlockId === block.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        aria-label="Apagar"
                        className="hover:text-neutral-900"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPickerForBlockId(block.id);
                          setPickerQuery("");
                          setPickerOpen(true);
                        }}
                        aria-label="Adicionar"
                        className="hover:text-neutral-900"
                      >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                      <div className="relative group/options">
                        <button
                          type="button"
                          onPointerDown={(e) => startBlockDrag(e, block.id)}
                          onClick={() => setOptionsPanelBlockId(optionsPanelBlockId === block.id ? null : block.id)}
                          className="cursor-grab active:cursor-grabbing hover:text-neutral-900 touch-none flex items-center"
                          aria-label="Mover e Opções"
                          data-grip-for={block.id}
                        >
                          <GripVertical className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                        
                        {optionsPanelBlockId === block.id && (
                          <>
                            <div 
                              className="fixed inset-0 z-[190]" 
                              onClick={() => setOptionsPanelBlockId(null)}
                            />
                            <div className="absolute left-0 top-full mt-1 z-[200] w-64 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-2 animate-in fade-in zoom-in-95 duration-200">
                              <div className="px-3 py-1.5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Obrigatório</span>
                                  <Switch 
                                    checked={(block as any).required !== false} 
                                    onCheckedChange={(val) => updateBlock(block.id, { required: val } as any)}
                                    className="scale-75"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSlashQuery("");
                                    setSlashIndex(0);
                                    slashStartRef.current = null;
                                    setActiveBlockId(block.id);
                                    setSlashReplaceForBlockId(block.id);
                                    setSlashMenuOpen(true);
                                    setOptionsPanelBlockId(null);
                                  }}
                                  className="w-full flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 -mx-3 px-3 py-1.5 rounded transition-colors"
                                >
                                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Substituir</span>
                                  <Type className="w-3.5 h-3.5 text-neutral-400" />
                                </button>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Mover</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBlocks((prev) => {
                                          const idx = prev.findIndex((b) => b.id === block.id);
                                          if (idx <= 0) return prev;
                                          const next = [...prev];
                                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                          return next;
                                        });
                                      }}
                                      aria-label="Mover para cima"
                                      className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" strokeWidth={2} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBlocks((prev) => {
                                          const idx = prev.findIndex((b) => b.id === block.id);
                                          if (idx < 0 || idx >= prev.length - 1) return prev;
                                          const next = [...prev];
                                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                          return next;
                                        });
                                      }}
                                      aria-label="Mover para baixo"
                                      className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Mínimo de caracteres</span>
                                    <Switch 
                                      checked={!!(block as any).minChars} 
                                      onCheckedChange={(val) => updateBlock(block.id, { minChars: val ? 1 : undefined } as any)}
                                      className="scale-75"
                                    />
                                  </div>
                                  {!!(block as any).minChars && (
                                    <div className="flex items-center gap-1.5 pl-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const cur = Number((block as any).minChars) || 1;
                                          updateBlock(block.id, { minChars: Math.max(1, cur - 1) } as any);
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm"
                                        aria-label="Diminuir mínimo"
                                      >
                                        −
                                      </button>
                                      <input
                                        type="number"
                                        min={1}
                                        value={(block as any).minChars ?? 1}
                                        onChange={(e) => {
                                          const n = parseInt(e.target.value, 10);
                                          updateBlock(block.id, { minChars: Number.isFinite(n) && n >= 1 ? n : 1 } as any);
                                        }}
                                        className="flex-1 h-6 text-xs text-center rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const cur = Number((block as any).minChars) || 1;
                                          updateBlock(block.id, { minChars: cur + 1 } as any);
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm"
                                        aria-label="Aumentar mínimo"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Máximo de caracteres</span>
                                    <Switch 
                                      checked={!!(block as any).maxChars} 
                                      onCheckedChange={(val) => updateBlock(block.id, { maxChars: val ? 100 : undefined } as any)}
                                      className="scale-75"
                                    />
                                  </div>
                                  {!!(block as any).maxChars && (
                                    <div className="flex items-center gap-1.5 pl-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const cur = Number((block as any).maxChars) || 1;
                                          updateBlock(block.id, { maxChars: Math.max(1, cur - 1) } as any);
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm"
                                        aria-label="Diminuir máximo"
                                      >
                                        −
                                      </button>
                                      <input
                                        type="number"
                                        min={1}
                                        value={(block as any).maxChars ?? 100}
                                        onChange={(e) => {
                                          const n = parseInt(e.target.value, 10);
                                          updateBlock(block.id, { maxChars: Number.isFinite(n) && n >= 1 ? n : 1 } as any);
                                        }}
                                        className="flex-1 h-6 text-xs text-center rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const cur = Number((block as any).maxChars) || 1;
                                          updateBlock(block.id, { maxChars: cur + 1 } as any);
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm"
                                        aria-label="Aumentar máximo"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="h-px bg-neutral-100 dark:bg-neutral-700 my-1.5" />

                              <button
                                onClick={() => {
                                  removeBlock(block.id);
                                  setOptionsPanelBlockId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-between transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  <Trash2 className="w-4 h-4" />
                                  Excluir
                                </div>
                                <span className="text-[10px] text-neutral-400">Del</span>
                              </button>
                              
                              <button
                                onClick={() => {
                                  duplicateBlock(block.id);
                                  setOptionsPanelBlockId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  <CopyIcon className="w-4 h-4" />
                                  Duplicar
                                </div>
                                <span className="text-[10px] text-neutral-400">Ctrl D</span>
                              </button>

                              <button
                                onClick={() => {
                                  updateBlock(block.id, { hidden: !(block as any).hidden } as any);
                                  setOptionsPanelBlockId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  <EyeOff className="w-4 h-4" />
                                  Esconder
                                </div>
                                <span className="text-[10px] text-neutral-400">Ctrl ⇧ H</span>
                              </button>

                              <button
                                onClick={() => {
                                  toast.info("Lógica condicional em breve!");
                                  setOptionsPanelBlockId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  <Network className="w-4 h-4" />
                                  Adicionar lógica condicional
                                </div>
                                <span className="text-[10px] text-neutral-400">Ctrl ⇧ L</span>
                              </button>

                              <div className="h-px bg-neutral-100 dark:bg-neutral-700 my-1.5" />

                              <button
                                onClick={() => setOptionsPanelBlockId(null)}
                                className="w-full px-3 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  <Type className="w-4 h-4" />
                                  Transformar em...
                                </div>
                                <ChevronDown className="w-4 h-4 text-neutral-400" />
                              </button>
                            </div>
                          </>
                        )}
                        {slashReplaceForBlockId === block.id && slashMenuOpen && filteredOptions.length > 0 && (
                          <>
                            <div
                              className="fixed inset-0 z-[190]"
                              onClick={() => { setSlashMenuOpen(false); setSlashReplaceForBlockId(null); setSlashQuery(""); }}
                            />
                            <div className="absolute left-0 top-full mt-1 z-[200] w-64 max-h-80 overflow-y-auto bg-white rounded-lg border border-neutral-200 shadow-lg py-1 animate-in fade-in zoom-in-95 duration-200">
                              {(() => {
                                let runningIdx = 0;
                                return filteredSections.map((section) => (
                                  <div key={section.title}>
                                    <p className="px-3 py-1.5 text-xs font-medium text-neutral-500">{section.title}</p>
                                    {section.options.map((opt) => {
                                      const Icon = opt.icon;
                                      const idx = runningIdx++;
                                      return (
                                        <button
                                          key={opt.label}
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            insertOption(opt.label);
                                          }}
                                          onMouseEnter={() => setSlashIndex(idx)}
                                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-all ${
                                            idx === slashIndex ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
                                          }`}
                                        >
                                          <Icon className="w-4 h-4 text-neutral-500" />
                                          <span>{opt.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ));
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`flex-1 min-w-0 ${draggingId === block.id ? "opacity-0 pointer-events-none" : ""}`}>
                      {(() => {
                        const interactiveTypes = ["short-answer","long-answer","multiple-choice","checkboxes","dropdown","multi-select","number","email","phone","link","file-upload","date","time","linear-scale","matrix","rating","signature","ranking","image","task-list","counter","currency","audio","qr-code","camera"];
                         if (!interactiveTypes.includes(block.type)) return inner;
                         if (block.type === "image" && ((block as any).variant === "profile" || (block as any).variant === "cover")) return inner;
                        const subtitle = (block as any).subtitle || "";
                        const isActive = activeBlockId === block.id;
                        const showSubtitle = isActive || subtitle.length > 0;
                        return (
                          <div className="space-y-1.5">
                            {showSubtitle && (
                              <div className="flex items-start gap-2 group/subtitle">
                                <textarea
                                  value={subtitle}
                                  onChange={(e) => {
                                    const currentTitle = String((block as any).title ?? "");
                                    const currentSubtitle = String((block as any).subtitle ?? "");
                                    updateBlock(block.id, {
                                      subtitle: e.target.value,
                                      ...(block.type === "camera" && (!currentTitle.trim() || currentTitle === currentSubtitle)
                                        ? { title: e.target.value }
                                        : {}),
                                    } as any);
                                  }}
                                  onFocus={() => setActiveBlockId(block.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Backspace") {
                                      const target = e.target as HTMLTextAreaElement;
                                      // Delete block if at start of subtitle or if we want it super aggressive
                                      if (target.selectionStart === 0 && target.selectionEnd === 0) {
                                        e.preventDefault();
                                        removeBlock(block.id);
                                      }
                                    }
                                  }}
                                  placeholder="Digite uma pergunta"
                                  rows={1}
                                  className="w-full bg-transparent border-none outline-none text-lg placeholder:text-neutral-400 font-bold resize-none px-0 py-0"
                                  style={{ minHeight: "1.5em", color: textColor }}
                                  onInput={(e) => {
                                    const el = e.currentTarget;
                                    el.style.height = "auto";
                                    el.style.height = el.scrollHeight + "px";
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateBlock(block.id, { required: !(block as any).required } as any);
                                  }}
                                  className={`text-lg font-bold select-none transition-all ml-1 ${
                                    (block as any).required !== false 
                                      ? "text-[#FF007F] opacity-100" 
                                      : "text-neutral-300 opacity-0 group-hover/subtitle:opacity-100 hover:opacity-100"
                                  }`}
                                  style={{ marginTop: "2px" }}
                                  title={(block as any).required !== false ? "Remover obrigatoriedade" : "Tornar obrigatória"}
                                >
                                  *
                                </button>
                              </div>
                            )}
                            {inner}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
                 {isStarted && (
                  <div ref={sendButtonPanelRef} className="mt-6 mb-4 flex flex-col items-start gap-3 relative">
                    <div className="flex items-center gap-2 group">
                      <div
                        className="relative"
                        onMouseEnter={() => setIsBtnHovered(true)}
                        onMouseLeave={() => setIsBtnHovered(false)}
                      >
                        <button
                          type="button"
                          onClick={() => setSendButtonPanelOpen(!sendButtonPanelOpen)}
                          className={`absolute right-full top-1/2 -translate-y-1/2 mr-1 p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded-lg transition-all duration-300 ${
                            sendButtonPanelOpen || isBtnHovered
                              ? "opacity-100 translate-x-0 pointer-events-auto"
                              : "opacity-0 -translate-x-2 pointer-events-none"
                          }`}
                          title="Configurar botão"
                        >
                          <Settings className="w-5 h-5" />
                        </button>
                        <button
                        type="button"
                        onClick={() => {
                          setSendButtonPanelOpen(!sendButtonPanelOpen);
                        }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all active:scale-95"
                        style={{ backgroundColor: btnBgColor, color: btnTextColor }}
                      >
                        {isPublishing ? "Enviando..." : (
                          <>
                            {btnIconPosition === "start" && renderBtnIcon(btnIcon)}
                            {btnText}
                            {btnIconPosition !== "start" && renderBtnIcon(btnIcon)}
                          </>
                        )}
                        </button>
                      </div>
                    </div>

                    {sendButtonPanelOpen && (
                      <div className="w-full max-w-sm p-4 bg-white rounded-xl border border-neutral-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 z-10">
                        <div className="flex items-center gap-1 p-0.5 bg-neutral-100 rounded-lg mb-3">
                          {([
                            { key: "text", label: "Texto" },
                            { key: "icon", label: "Ícone" },
                            { key: "position", label: "Posição" },
                          ] as const).map((tab) => {
                            const active = sendButtonPanelTab === tab.key;
                            return (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setSendButtonPanelTab(tab.key)}
                                className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-all ${
                                  active
                                    ? "bg-white text-neutral-900 shadow-sm"
                                    : "text-neutral-500 hover:text-neutral-700"
                                }`}
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>

                        {sendButtonPanelTab === "text" && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Texto do botão</label>
                            <input
                              type="text"
                              value={btnText}
                              autoFocus
                              onChange={(e) => setBtnText(e.target.value)}
                              placeholder="Digite o texto do botão..."
                              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#FF007F] transition-all"
                              data-no-toolbar="true"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") {
                                  setSendButtonPanelOpen(false);
                                }
                              }}
                            />
                            <p className="text-[10px] text-neutral-400">Pressione Enter para salvar</p>
                          </div>
                        )}

                        {sendButtonPanelTab === "icon" && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Ícone do botão</label>
                            <div className="grid grid-cols-6 gap-1.5">
                              {BTN_ICON_OPTIONS.map(({ key, label, Icon }) => {
                                const selected = (btnIcon || "arrow-right") === key;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    title={label}
                                    onClick={() => setBtnIcon(key)}
                                    className={`flex items-center justify-center h-8 w-full rounded-lg border transition-all ${
                                      selected
                                        ? "border-[#FF007F] bg-pink-50 text-[#FF007F]"
                                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                                    }`}
                                  >
                                    <Icon className="w-4 h-4" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {sendButtonPanelTab === "position" && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Posição do ícone</label>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setBtnIconPosition("start")}
                                className={`flex items-center justify-center gap-1.5 h-8 rounded-lg border text-xs font-medium transition-all ${
                                  btnIconPosition === "start"
                                    ? "border-[#FF007F] bg-pink-50 text-[#FF007F]"
                                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                                }`}
                              >
                                Início
                              </button>
                              <button
                                type="button"
                                onClick={() => setBtnIconPosition("end")}
                                className={`flex items-center justify-center gap-1.5 h-8 rounded-lg border text-xs font-medium transition-all ${
                                  btnIconPosition === "end"
                                    ? "border-[#FF007F] bg-pink-50 text-[#FF007F]"
                                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                                }`}
                              >
                                Fim
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
               {slashMenuOpen && !slashReplaceForBlockId && filteredOptions.length > 0 && (() => {
                 const hasProfile = blocks.some(b => b.type === "image" && b.variant === "profile");
                 const hasCover = blocks.some(b => b.type === "image" && b.variant === "cover");
                 
                 return (
                <div
                  className="fixed z-50 w-64 max-h-80 overflow-y-auto bg-white rounded-lg border border-neutral-200 shadow-lg py-1"
                  style={{ top: slashMenuPos.top, left: slashMenuPos.left }}
                >
                  {(() => {
                    let runningIdx = 0;
                    return filteredSections.map((section) => (
                      <div key={section.title}>
                        <p className="px-3 py-1.5 text-xs font-medium text-neutral-500">{section.title}</p>
                        {section.options.map((opt) => {
                           const Icon = opt.icon;
                           const idx = runningIdx++;
                           const isProfile = opt.label === "Logo";
                           const isCover = opt.label === "Capa";
                           const isDisabled = (isProfile && hasProfile) || (isCover && hasCover);

                           return (
                             <button
                               key={opt.label}
                               type="button"
                               disabled={isDisabled}
                               onMouseDown={(e) => {
                                 e.preventDefault();
                                 if (!isDisabled) insertOption(opt.label);
                               }}
                               onMouseEnter={() => !isDisabled && setSlashIndex(idx)}
                               className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-all ${
                                 idx === slashIndex ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
                               } ${isDisabled ? "opacity-40 grayscale-[0.5] cursor-not-allowed bg-neutral-50/50" : ""}`}
                             >
                               <Icon className={`w-4 h-4 ${isDisabled ? "text-neutral-300" : "text-neutral-500"}`} />
                               <span className={isDisabled ? "text-neutral-400" : ""}>{opt.label}</span>
                             </button>
                           );
                        })}
                      </div>
                    ));
                   })()}
                 </div>
               );
               })()}
            </div>
          )}
          </div>
        </div>
      </main>

      <button
        type="button"
        className="fixed bottom-4 right-4 w-8 h-8 rounded-full border border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900 flex items-center justify-center shadow-sm"
      >
        <HelpCircle className="w-4 h-4" />
      </button>


      {pickerOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-24"
          onClick={() => { setPickerOpen(false); setPickerQuery(""); setPickerForBlockId(null); setPickerReplaceMode(false); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="text"
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Buscar perguntas, campos e blocos de layout..."
                className="flex-1 bg-transparent outline-none text-sm text-neutral-800 placeholder:text-neutral-400"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setPickerOpen(false);
                    setPickerQuery("");
                    setPickerForBlockId(null);
                    setPickerReplaceMode(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => { setPickerOpen(false); setPickerQuery(""); setPickerForBlockId(null); setPickerReplaceMode(false); }}
                className="text-neutral-400 hover:text-neutral-700"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto py-2">
              {pickerFilteredSections.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-neutral-400">
                  Nenhuma opção encontrada
                </div>
              ) : (
                pickerFilteredSections.map((section) => (
                  <div key={section.title} className="mb-2">
                    <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      {section.title}
                    </p>
                    {section.options.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => insertBlockFromPicker(opt.label)}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left text-neutral-700 hover:bg-neutral-100 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-neutral-500" strokeWidth={2} />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeHistory}
          />
          <aside className="relative ml-auto w-[320px] h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-900">Histórico de versões</h2>
              <div className="flex items-center gap-2 text-neutral-400">
                <button type="button" className="hover:text-neutral-700" aria-label="Ajuda">
                  <HelpCircle className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={closeHistory}
                  className="hover:text-neutral-700"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => previewVersion("current")}
                className={`w-full text-left px-4 py-3 border-b border-neutral-100 ${
                  selectedVersion === "current" ? "bg-neutral-50" : "hover:bg-neutral-50"
                }`}
              >
                <p className="text-sm font-medium text-neutral-900">Versão atual</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-300 to-pink-400" />
                  <span className="text-xs text-neutral-600">
                    Brayan · {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </button>

              <p className="px-4 pt-4 pb-2 text-xs text-neutral-500">
                {versionHistory.length - 1} versões salvas automaticamente
              </p>

              <ul>
                {versionHistory.filter((v) => !v.isCurrent).map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => previewVersion(v.id)}
                      className={`w-full text-left px-4 py-3 ${
                        selectedVersion === v.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                      }`}
                    >
                      <p className="text-sm font-medium text-neutral-900">{v.label}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-300 to-pink-400" />
                        <span className="text-xs text-neutral-600">{v.time}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={restoreSelected}
                disabled={selectedVersion === "current"}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
              >
                Restaurar
              </button>
            </div>
          </aside>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-3 flex items-center">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="inline-flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-900 border border-neutral-200 rounded-md px-2 py-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar ao editor
            </button>
          </div>

          <div className="max-w-3xl mx-auto px-8 pt-10 pb-20">
            <h1 className="text-2xl font-bold text-neutral-900 mb-8">Configurações</h1>
            
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg w-fit mb-10">
              <button 
                onClick={() => setSettingsActiveTab("geral")}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${settingsActiveTab === "geral" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Geral
              </button>
              <button 
                onClick={() => setSettingsActiveTab("compartilhar")}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${settingsActiveTab === "compartilhar" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Compartilhar
              </button>
              <button 
                onClick={() => setSettingsActiveTab("envios")}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${settingsActiveTab === "envios" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Envios
              </button>
              <button 
                onClick={() => setSettingsActiveTab("insights")}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${settingsActiveTab === "insights" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Insights
              </button>
              <button 
                onClick={() => setSettingsActiveTab("emails" as any)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${settingsActiveTab as string === "emails" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                E-mails
              </button>
              <button
                onClick={() => setSettingsActiveTab("apresentacao")}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${settingsActiveTab === "apresentacao" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Apresentação
              </button>
            </div>


            {settingsActiveTab === "geral" && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h2 className="text-sm font-semibold text-neutral-900">Configurações gerais</h2>
                <div className="mt-4 border-t border-neutral-200">
                <SettingsRow
                  title="Redirecionar ao concluir"
                  description="Redirecionar para uma URL personalizada quando o checklist for enviado."
                  control={<Switch checked={redirectOnCompletion} onCheckedChange={setRedirectOnCompletion} />}
                />
                {redirectOnCompletion && (
                  <div className="pl-6 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                      type="url"
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      placeholder="https://exemplo.com/obrigado"
                      className="w-full max-w-md text-sm border border-neutral-300 rounded-md px-3 py-2 bg-white outline-none focus:border-pink-500"
                    />
                    <p className="text-xs text-neutral-500 mt-1.5">O respondente será enviado para esta URL após clicar em enviar.</p>
                  </div>
                )}
                <SettingsRow
                  title="Barra de progresso"
                  description="A barra de progresso oferece uma forma clara para os respondentes entenderem o quanto do checklist eles já completaram, incentivando-os a continuar até o fim."
                  control={<Switch checked={progressBar} onCheckedChange={setProgressBar} />}
                />
                <SettingsRow
                  title="Envios parciais"
                  badge={{ label: "Pro", color: "bg-pink-100 text-pink-600" }}
                  description="Colete respostas de pessoas que preencheram parte do seu checklist, mas não clicaram no botão de enviar. Você não pode exportar envios parciais com integrações, nem habilitar notificações por email."
                  control={<Switch checked={partialSubmissions} onCheckedChange={setPartialSubmissions} />}
                />
                <SettingsRow
                  title="Marca ChecklistApp"
                  badge={{ label: "Pro", color: "bg-pink-100 text-pink-600" }}
                  description='Mostrar "Feito com ChecklistApp" no seu checklist.'
                  control={<Switch checked={checklistBranding} onCheckedChange={setChecklistBranding} />}
                />
                <SettingsRow
                  title="Retenção de dados de envios"
                  badge={{ label: "Pro", color: "bg-pink-100 text-pink-600" }}
                  description="Exclua automaticamente as respostas (envios) após um período definido. O seu checklist original nunca será excluído, apenas as respostas recebidas serão apagadas para conformidade."
                  control={<Switch checked={dataRetention} onCheckedChange={async (checked) => {
                    const previous = dataRetention;
                    setDataRetention(checked);
                    if (!checklistId) return;
                    const { error } = await supabase.rpc("update_checklist_retention", {
                      p_checklist_id: checklistId,
                      p_retention_days: retentionDays,
                      p_is_enabled: checked,
                    });
                    if (error) {
                      console.error("Erro ao atualizar retenção:", error);
                      setDataRetention(previous);
                      toast.error("Erro ao salvar retenção");
                      return;
                    }
                    toast.success(checked ? `Retenção habilitada (${retentionDays} dias)` : "Retenção desabilitada");
                  }} />}
                />
                {dataRetention && (
                  <div className="pl-6 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-neutral-500">Excluir após</span>
                      <select
                        value={retentionDays}
                        onChange={async (e) => {
                          const days = Number(e.target.value);
                          const previous = retentionDays;
                          setRetentionDays(days);
                          if (!checklistId) return;
                          const { error } = await supabase.rpc("update_checklist_retention", {
                            p_checklist_id: checklistId,
                            p_retention_days: days,
                            p_is_enabled: dataRetention,
                          });
                          if (error) {
                            console.error("Erro ao atualizar retenção:", error);
                            setRetentionDays(previous);
                            toast.error("Erro ao salvar período");
                            return;
                          }
                          toast.success(`Respostas serão excluídas após ${days} dias`);
                        }}
                        className="text-xs font-bold border border-neutral-300 rounded-md px-2 py-1 bg-white outline-none focus:border-pink-500"
                      >
                        {[3, 4, 5, 6, 7, 15, 30].map(d => (
                          <option key={d} value={d}>{d} dias</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <h2 className="mt-10 text-sm font-semibold text-neutral-900">Notificações por email</h2>
              <div className="mt-4 border-t border-neutral-200">
                <SettingsRow
                  title="Notificações por email para você"
                  description="Receba um email a cada novo envio de formulário."
                  control={<Switch checked={selfEmailNotif} onCheckedChange={setSelfEmailNotif} />}
                />
                <SettingsRow
                  title="Notificações por email para respondentes"
                  badge={{ label: "Pro", color: "bg-pink-100 text-pink-600" }}
                  description="Envie um email com texto personalizado aos respondentes após o envio do formulário."
                  control={
                    <button 
                      onClick={() => setSettingsActiveTab("emails")}
                      className="text-xs font-bold text-pink-600 hover:text-pink-700"
                    >
                      Configurar
                    </button>
                  }
                />

              </div>

              <h2 className="mt-10 text-sm font-semibold text-neutral-900">Acesso</h2>
              <div className="mt-4 border-t border-neutral-200">
                <SettingsRow
                  title="Proteger formulário com senha"
                  description="Habilite esta configuração para exigir uma senha antes que os respondentes possam acessar o formulário."
                  control={<Switch checked={passwordProtect} onCheckedChange={setPasswordProtect} />}
                />
                {passwordProtect && (
                  <div className="pl-6 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value.slice(0, 100))}
                      placeholder="Digite a senha"
                      className="text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white outline-none focus:border-pink-500 w-64"
                    />
                  </div>
                )}
                <SettingsRow
                  title="Fechar formulário"
                  description="As pessoas não poderão mais responder a este formulário."
                  control={<Switch checked={closeForm} onCheckedChange={setCloseForm} />}
                />
                <SettingsRow
                  title="Fechar formulário em uma data agendada"
                  description="Agende uma data em que o formulário será fechado para novos envios."
                  control={<Switch checked={closeFormScheduled} onCheckedChange={setCloseFormScheduled} />}
                />
                {closeFormScheduled && (
                  <div className="pl-6 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                      type="datetime-local"
                      value={closeFormDate}
                      onChange={(e) => setCloseFormDate(e.target.value)}
                      className="text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white outline-none focus:border-pink-500"
                    />
                  </div>
                )}
                <SettingsRow
                  title="Limitar número de envios"
                  description="Defina quantos envios você quer receber no total."
                  control={<Switch checked={limitSubmissions} onCheckedChange={setLimitSubmissions} />}
                />
                {limitSubmissions && (
                  <div className="pl-6 pb-4 animate-in fade-in slide-in-from-top-1 duration-200 flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500">Fechar após</span>
                    <input
                      type="number"
                      min={1}
                      value={submissionLimit}
                      onChange={(e) => setSubmissionLimit(Math.max(1, Number(e.target.value) || 1))}
                      className="text-xs font-bold border border-neutral-300 rounded-md px-2 py-1.5 bg-white outline-none focus:border-pink-500 w-24"
                    />
                    <span className="text-xs font-medium text-neutral-500">envios</span>
                  </div>
                )}
                <SettingsRow
                  title="Mensagem de formulário fechado"
                  description="Isso é o que os destinatários verão se você fechar o formulário com uma das opções acima."
                  control={<Switch checked={closedFormMessage} onCheckedChange={setClosedFormMessage} />}
                />
                {closedFormMessage && (
                  <div className="pl-6 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <textarea
                      value={closedMessageText}
                      onChange={(e) => setClosedMessageText(e.target.value.slice(0, 500))}
                      rows={3}
                      placeholder="Este formulário está fechado e não está mais aceitando respostas."
                      className="w-full max-w-md text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white outline-none focus:border-pink-500 resize-y"
                    />
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-center gap-6">
                <button
                  type="button"
                  className="text-sm text-neutral-400 cursor-not-allowed border border-neutral-200 rounded-md px-3 py-1.5"
                  disabled
                >
                  Salvar alterações
                </button>
                <button type="button" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
                  <HelpCircle className="w-4 h-4" />
                  Saiba mais sobre as configurações
                </button>
              </div>
              </section>
            )}

            {settingsActiveTab === "compartilhar" && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 py-10">
                {checklistId ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900 mb-2">Compartilhe seu checklist</h3>
                      <p className="text-sm text-neutral-500">Copie o link abaixo para enviar para seus clientes ou colaboradores.</p>
                    </div>

                    <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-4 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-neutral-400 uppercase mb-1">Link direto</p>
                          <p className="text-sm font-medium text-neutral-600 truncate">
                            {customDomain && customDomainStatus === 'verified' 
                              ? `https://${customDomain}/${publicShareId}`
                              : `${window.location.origin}/c/${publicShareId}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link 
                            to="/dominios" 
                            className="p-2 text-neutral-400 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-all"
                            title="Gerenciar domínios"
                          >
                            <Settings className="w-4 h-4" />
                          </Link>
                          <button
                            disabled={!publicShareId}
                            onClick={() => {
                              if (!publicShareId) {
                                toast.error("Link indisponível: publique o checklist primeiro.");
                                return;
                              }
                              const url = customDomain && customDomainStatus === 'verified'
                                ? `https://${customDomain}/${publicShareId}`
                                : `${window.location.origin}/c/${publicShareId}`;

                              navigator.clipboard.writeText(url);
                              toast.success("Link copiado!");
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
                          >
                            <Copy className="w-4 h-4" /> Copiar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <a 
                        href={customDomain && customDomainStatus === 'verified' ? `https://${customDomain}/${publicShareId}` : `/c/${publicShareId}`} 

                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 p-4 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" /> Abrir checklist
                      </a>
                    </div>

                  </div>
                ) : (
                  <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2">Compartilhar</h3>
                    <p className="text-neutral-500 max-w-sm mx-auto">Publique seu checklist para gerar um link de acesso e começar a compartilhar.</p>
                  </div>
                )}
              </section>
            )}


            {settingsActiveTab === "envios" && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 py-10">
                {settingsChecklistId ? (
                  <Suspense fallback={<div className="text-center py-12 text-neutral-500">Carregando envios…</div>}>
                    <SubmissionsTab
                      checklistId={settingsChecklistId}
                      onRetentionChange={(enabled, days) => {
                        setDataRetention(enabled);
                        setRetentionDays(days);
                      }}
                    />
                  </Suspense>
                ) : (
                  <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2">Envios</h3>
                    <p className="text-neutral-500 max-w-sm mx-auto">Publique seu checklist para começar a receber envios.</p>
                  </div>
                )}
              </section>
            )}

            {settingsActiveTab === "insights" && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 py-10">
                {settingsChecklistId ? (
                  <Suspense fallback={<div className="text-center py-12 text-neutral-500">Carregando insights…</div>}>
                    <InsightsTab checklistId={settingsChecklistId} />
                  </Suspense>
                ) : (
                  <div className="bg-neutral-50 rounded-2xl p-12 border border-dashed border-neutral-200 text-center">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2">Insights</h3>
                    <p className="text-neutral-500 max-w-sm mx-auto">Publique seu checklist primeiro para começar a coletar dados e visualizar insights.</p>
                  </div>
                )}
              </section>
            )}

            {settingsActiveTab === "emails" && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h2 className="text-sm font-semibold text-neutral-900">Configurações de E-mail</h2>
                <div className="mt-4 border-t border-neutral-200">
                  <div className="py-6 border-b border-neutral-200">
                    <h3 className="text-sm font-semibold text-neutral-900 mb-4">Notificações para você</h3>
                    <SettingsRow
                      title="Receber notificações de novos envios"
                      description="Você receberá um e-mail toda vez que alguém responder o formulário."
                      control={<Switch checked={selfEmailNotif} onCheckedChange={setSelfEmailNotif} />}
                    />
                    {selfEmailNotif && (
                      <div className="mt-4 space-y-4 pl-4 border-l-2 border-neutral-100 animate-in fade-in slide-in-from-left-1">
                        <CustomField label="Seu e-mail de destino">
                          <input
                            type="email"
                            value={ownerEmailAddress || user?.email || ""}
                            onChange={(e) => setOwnerEmailAddress(e.target.value)}
                            placeholder="seu@email.com"
                            className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400"
                          />
                        </CustomField>
                      </div>
                    )}
                  </div>

                  <div className="py-6 border-b border-neutral-200">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-sm font-semibold text-neutral-900">Domínio de envio de e-mail</h3>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-pink-100 text-pink-600">Pro</span>
                    </div>
                    
                    <CustomField label="Selecione o domínio verificado">
                      <select
                        value={customEmailDomainId || ""}
                        onChange={(e) => setCustomEmailDomainId(e.target.value || null)}
                        className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 bg-white"
                      >
                        <option value="">Padrão (tieck.com)</option>
                        {userDomains.filter(d => d.status === 'verified').map(d => (
                          <option key={d.id} value={d.id}>{d.domain}</option>
                        ))}
                      </select>
                    </CustomField>
                    <p className="mt-2 text-[11px] text-neutral-500 italic">
                      {customEmailDomainId 
                        ? "Os e-mails serão enviados usando seu domínio personalizado." 
                        : "Conecte e verifique um domínio na aba 'Domínios' para usar um remetente próprio."
                      }
                    </p>
                  </div>

                  <div className="py-6 border-b border-neutral-200">

                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-sm font-semibold text-neutral-900">Confirmação para o respondente</h3>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-pink-100 text-pink-600">Pro</span>
                    </div>
                    
                    <SettingsRow
                      title="Enviar e-mail automático de confirmação"
                      description="A pessoa que respondeu recebe um e-mail automático de confirmação após o envio."
                      control={<Switch checked={respondentEmailNotif} onCheckedChange={setRespondentEmailNotif} />}
                    />

                    {respondentEmailNotif && (
                      <div className="mt-4 space-y-6 pl-4 border-l-2 border-neutral-100 animate-in fade-in slide-in-from-left-1">
                        <CustomField label="Qual campo contém o e-mail do respondente?">
                          <select
                            value={respondentEmailFieldId}
                            onChange={(e) => setRespondentEmailFieldId(e.target.value)}
                            className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 bg-white"
                          >
                            <option value="">Selecione um campo</option>
                            {blocks.filter(b => b.type === 'short-answer' || b.type === 'email').map(b => (
                              <option key={b.id} value={b.id}>{(b as any).subtitle || (b as any).placeholder || `Campo ${b.id.slice(0,4)}`}</option>
                            ))}
                          </select>
                        </CustomField>

                        <CustomField label="Assunto do e-mail">
                          <input
                            type="text"
                            value={respondentEmailSubject}
                            onChange={(e) => setRespondentEmailSubject(e.target.value)}
                            className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2"
                          />
                        </CustomField>

                        <CustomField label="Mensagem personalizada">
                          <textarea
                            value={respondentEmailMessage}
                            onChange={(e) => setRespondentEmailMessage(e.target.value)}
                            rows={4}
                            className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 resize-none"
                            placeholder="Dica: use {{title}} para inserir o nome do checklist"
                          />
                        </CustomField>

                        <SettingsRow
                          title="Incluir cópia das respostas"
                          description="O e-mail conterá um resumo de todas as perguntas e respostas enviadas."
                          control={<Switch checked={includeResponsesInEmail} onCheckedChange={setIncludeResponsesInEmail} />}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={() => saveChecklist()}
                    className="text-sm bg-[#FF007F] text-white font-bold rounded-md px-6 py-2 hover:opacity-90 transition-opacity"
                  >
                    Salvar configurações
                  </button>
                </div>
              </section>
            )}

            {settingsActiveTab === "apresentacao" && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h2 className="text-sm font-semibold text-neutral-900">Tela de agradecimento</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Personalize a mensagem exibida ao respondente após o envio do checklist.
                </p>
                <div className="mt-6 space-y-6">
                  <CustomField label="Título">
                    <input
                      type="text"
                      value={thankYouTitle}
                      onChange={(e) => setThankYouTitle(e.target.value)}
                      placeholder="Obrigado por preencher este formulário!"
                      className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400"
                    />
                  </CustomField>
                  <CustomField label="Descrição">
                    <textarea
                      value={thankYouDescription}
                      onChange={(e) => setThankYouDescription(e.target.value)}
                      rows={3}
                      placeholder="Feito com Tieck, a forma mais simples de criar checklists gratuitamente."
                      className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400 resize-none"
                    />
                  </CustomField>
                </div>

                <div className="mt-8 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={() => saveChecklist()}
                    className="text-sm bg-[#FF007F] text-white font-bold rounded-md px-6 py-2 hover:opacity-90 transition-opacity"
                  >
                    Salvar configurações
                  </button>
                </div>
              </section>
            )}



          </div>
        </div>
      )}

      {isCustomizeOpen && (
        <aside className="fixed top-0 right-0 z-40 w-[360px] h-full bg-white border-l border-neutral-200 shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
            <h2 className="text-base font-semibold text-neutral-900">Personalizar</h2>
            <button
              type="button"
              onClick={() => setIsCustomizeOpen(false)}
              className="text-neutral-400 hover:text-neutral-700"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <CustomField label="Tema">
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm bg-white">
                <option>Claro</option>
                <option>Escuro</option>
              </select>
            </CustomField>

             <CustomField label="Fonte">
               <select value={font} onChange={(e) => setFont(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm bg-white">
                 <option value="Inter">Inter</option>
                 <option value="Roboto">Roboto</option>
                 <option value="Poppins">Poppins</option>
                 <option value="Lato">Lato</option>
                 <option value="Open Sans">Open Sans</option>
                 <option value="Montserrat">Montserrat</option>
                 <option value="Playfair Display">Playfair Display</option>
                 <option value="Merriweather">Merriweather</option>
                 <option value="Ubuntu">Ubuntu</option>
                 <option value="Oswald">Oswald</option>
                 <option value="Raleway">Raleway</option>
               </select>
             </CustomField>

            <div className="grid grid-cols-2 gap-3">
              <CustomColor label="Fundo" value={bgColor} onChange={setBgColor} />
              <CustomColor label="Texto" value={textColor} onChange={setTextColor} />
              <CustomColor label="Fundo do botão" value={btnBgColor} onChange={setBtnBgColor} />
              <CustomColor label="Texto do botão" value={btnTextColor} onChange={setBtnTextColor} />
            </div>

            <CustomColor label="Destaque" value={accentColor} onChange={setAccentColor} hint />

            <div className="relative">
              {user?.plan_type !== 'pro' && (
                <div className="absolute inset-x-[-20px] inset-y-[-10px] z-50 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center mb-3 text-[#FF007F]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-neutral-900 mb-1">Avançado</h3>
                  <p className="text-xs text-neutral-500 mb-4 max-w-[180px] mx-auto">
                    Libere o controle total sobre o design com o plano Pro.
                  </p>
                  <button
                    onClick={() => navigate({ to: '/membros' })}
                    className="px-4 py-1.5 bg-[#FF007F] text-white rounded-lg text-xs font-bold hover:opacity-90 transition-opacity shadow-sm"
                  >
                    Fazer upgrade
                  </button>
                </div>
              )}
              
              <div className="space-y-5">
                <div className="pt-4 border-t border-neutral-200">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">Avançado</h3>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-pink-100 text-pink-600">Pro</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">Layout</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <CustomField label="Largura da página">
                      <input value={pageWidth} onChange={(e) => setPageWidth(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomField label="Tamanho base da fonte">
                      <input value={baseFontSize} onChange={(e) => setBaseFontSize(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                  </div>

                  <div className="mt-3 grid grid-cols-[auto_1fr_1fr_1fr] gap-3 items-end">
                    <CustomField label="Logo">
                      <button type="button" className="w-10 h-10 border border-neutral-300 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700">
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    </CustomField>
                    <CustomField label="Largura">
                      <input value={logoWidth} onChange={(e) => setLogoWidth(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomField label="Altura">
                      <input value={logoHeight} onChange={(e) => setLogoHeight(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomField label="Raio">
                      <input value={logoRadius} onChange={(e) => setLogoRadius(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                  </div>

                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-3 items-end">
                    <CustomField label="Capa">
                      <button type="button" className="w-20 h-10 border border-neutral-300 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700">
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    </CustomField>
                    <CustomField label="Altura">
                      <input value={coverHeight} onChange={(e) => setCoverHeight(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">Campos</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <CustomField label="Largura">
                      <input value={inputWidth} onChange={(e) => setInputWidth(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomField label="Altura">
                      <input value={inputHeight} onChange={(e) => setInputHeight(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomColor label="Fundo" value={inputBg} onChange={setInputBg} />
                    <CustomColor label="Placeholder" value={inputPlaceholder} onChange={setInputPlaceholder} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <CustomColor label="Borda" value={inputBorder} onChange={setInputBorder} />
                    <CustomField label="Largura">
                      <input value={inputBorderWidth} onChange={(e) => setInputBorderWidth(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomField label="Raio">
                      <input value={inputRadius} onChange={(e) => setInputRadius(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <CustomField label="Margem inferior">
                      <input value={inputMarginBottom} onChange={(e) => setInputMarginBottom(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                    <CustomField label="Padding horizontal">
                      <input value={inputPadding} onChange={(e) => setInputPadding(e.target.value)} className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm" />
                    </CustomField>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
    {selectionToolbar.visible && (() => {
      const { isBold, isItalic, isUnderline } = checkFormatting(selectionToolbar.el, selectionToolbar.start, selectionToolbar.end);
      return (
        <div
          className="fixed z-[200] flex items-center gap-0.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg px-1.5 py-1"
          style={{ top: selectionToolbar.top, left: selectionToolbar.left }}
          onMouseDown={(e) => e.preventDefault()}
          data-color-picker-root
        >
          <button
            type="button"
            onClick={() => handleFormat("bold")}
            title="Negrito"
            className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${isBold ? "text-[#FF007F]" : "text-neutral-700 dark:text-neutral-200"}`}
          >
            <Bold className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => handleFormat("italic")}
            title="Itálico"
            className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${isItalic ? "text-[#FF007F]" : "text-neutral-700 dark:text-neutral-200"}`}
          >
            <Italic className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => handleFormat("underline")}
            title="Sublinhado"
            className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${isUnderline ? "text-[#FF007F]" : "text-neutral-700 dark:text-neutral-200"}`}
          >
            <Underline className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                // Save selection range BEFORE opening picker
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  savedRangeRef.current = sel.getRangeAt(0).cloneRange();
                }
                setHighlightPickerOpen(false);
                setColorPickerOpen((v) => !v);
              }}
              title="Cor do texto"
              className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center ${colorPickerOpen ? "text-[#FF007F]" : "text-neutral-700 dark:text-neutral-200"}`}
            >
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-bold leading-none" style={{ fontFamily: "serif" }}>A</span>
                <div className="w-3 h-0.5 mt-0.5 rounded-sm" style={{ backgroundColor: currentTextColor }} />
              </div>
            </button>
            {colorPickerOpen && (
              <div className="absolute top-full left-0 mt-2 z-[210]" data-color-picker-root>
                <ColorPicker
                  value={currentTextColor}
                  onChange={(c) => {
                    setCurrentTextColor(c);
                    // Restore selection
                    const el = selectionToolbar.el;
                    if (el instanceof HTMLElement && el.contentEditable === "true" && savedRangeRef.current) {
                      el.focus();
                      const sel = window.getSelection();
                      if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(savedRangeRef.current);
                      }
                      document.execCommand("styleWithCSS", false, "true");
                      document.execCommand("foreColor", false, c);
                      // Re-save range in case it changed
                      if (sel && sel.rangeCount > 0) {
                        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
                      }
                    }
                  }}
                  onReset={() => {
                    setCurrentTextColor("#37352f");
                    const el = selectionToolbar.el;
                    if (el instanceof HTMLElement && el.contentEditable === "true" && savedRangeRef.current) {
                      el.focus();
                      const sel = window.getSelection();
                      if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(savedRangeRef.current);
                      }
                      document.execCommand("styleWithCSS", false, "true");
                      document.execCommand("removeFormat", false);
                    }
                    setColorPickerOpen(false);
                  }}
                />
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  savedRangeRef.current = sel.getRangeAt(0).cloneRange();
                }
                setColorPickerOpen(false);
                setHighlightPickerOpen((v) => !v);
              }}
              title="Cor de destaque"
              className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center ${highlightPickerOpen ? "text-[#FF007F]" : "text-neutral-700 dark:text-neutral-200"}`}
            >
              <div className="flex flex-col items-center">
                <Highlighter className="w-3 h-3" strokeWidth={2.5} />
                <div className="w-3 h-0.5 mt-0.5 rounded-sm" style={{ backgroundColor: currentHighlightColor }} />
              </div>
            </button>
            {highlightPickerOpen && (
              <div className="absolute top-full left-0 mt-2 z-[210]" data-color-picker-root>
                <ColorPicker
                  value={currentHighlightColor}
                  onChange={(c) => {
                    setCurrentHighlightColor(c);
                    const el = selectionToolbar.el;
                    if (el instanceof HTMLElement && el.contentEditable === "true" && savedRangeRef.current) {
                      el.focus();
                      const sel = window.getSelection();
                      if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(savedRangeRef.current);
                      }
                      document.execCommand("styleWithCSS", false, "true");
                      document.execCommand("hiliteColor", false, c);
                      if (sel && sel.rangeCount > 0) {
                        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
                      }
                    }
                  }}
                  onReset={() => {
                    setCurrentHighlightColor("#FFE999");
                    const el = selectionToolbar.el;
                    if (el instanceof HTMLElement && el.contentEditable === "true" && savedRangeRef.current) {
                      el.focus();
                      const sel = window.getSelection();
                      if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(savedRangeRef.current);
                      }
                      document.execCommand("styleWithCSS", false, "true");
                      document.execCommand("hiliteColor", false, "transparent");
                    }
                    setHighlightPickerOpen(false);
                  }}
                />
              </div>
            )}
          </div>
          <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
          <div className="relative" data-link-popover-root>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  savedRangeRef.current = sel.getRangeAt(0).cloneRange();
                }
              }}
              onClick={() => {
                setColorPickerOpen(false);
                setHighlightPickerOpen(false);
                setLinkUrl("");
                setLinkPopoverOpen((v) => !v);
              }}
              title="Adicionar link"
              className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${linkPopoverOpen ? "text-[#FF007F]" : "text-neutral-700 dark:text-neutral-200"}`}
            >
              <Link2 className="w-4 h-4" strokeWidth={2.5} />
            </button>
            {linkPopoverOpen && (
              <div
                className="absolute top-full left-0 mt-2 z-[210] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-2xl p-1.5 flex items-center gap-1.5"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  type="url"
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const url = linkUrl.trim();
                      if (!url) return;
                      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                      const el = selectionToolbar.el;
                      if (el instanceof HTMLElement && el.contentEditable === "true" && savedRangeRef.current) {
                        el.focus();
                        const sel = window.getSelection();
                        if (sel) {
                          sel.removeAllRanges();
                          sel.addRange(savedRangeRef.current);
                        }
                        document.execCommand("createLink", false, href);
                        // Style the just-created link
                        const links = el.querySelectorAll(`a[href="${href}"]`);
                        links.forEach((a) => {
                          (a as HTMLAnchorElement).style.color = "#2563eb";
                          (a as HTMLAnchorElement).style.textDecoration = "underline";
                          (a as HTMLAnchorElement).target = "_blank";
                          (a as HTMLAnchorElement).rel = "noopener noreferrer";
                        });
                      }
                      setLinkPopoverOpen(false);
                      setLinkUrl("");
                    } else if (e.key === "Escape") {
                      setLinkPopoverOpen(false);
                      setLinkUrl("");
                    }
                  }}
                  placeholder="Cole qualquer link da web"
                  className="text-sm px-2.5 py-1.5 rounded-md border border-blue-300 outline-none focus:border-blue-500 bg-white dark:bg-neutral-800 dark:border-neutral-700 w-[220px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const url = linkUrl.trim();
                    if (!url) return;
                    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                    const el = selectionToolbar.el;
                    if (el instanceof HTMLElement && el.contentEditable === "true" && savedRangeRef.current) {
                      el.focus();
                      const sel = window.getSelection();
                      if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(savedRangeRef.current);
                      }
                      document.execCommand("createLink", false, href);
                      const links = el.querySelectorAll(`a[href="${href}"]`);
                      links.forEach((a) => {
                        (a as HTMLAnchorElement).style.color = "#2563eb";
                        (a as HTMLAnchorElement).style.textDecoration = "underline";
                        (a as HTMLAnchorElement).target = "_blank";
                        (a as HTMLAnchorElement).rel = "noopener noreferrer";
                      });
                    }
                    setLinkPopoverOpen(false);
                    setLinkUrl("");
                  }}
                  className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 font-medium"
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </div>
      );
    })()}
      </DashboardLayout>

      <AlertDialog
        open={publishBlocker !== null}
        onOpenChange={(open) => { if (!open) setPublishBlocker(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível publicar</AlertDialogTitle>
            <AlertDialogDescription>
              O bloco{" "}
              <span className="font-semibold text-neutral-800">
                “{publishBlocker?.label}”
              </span>{" "}
              está com a verificação por IA ativada. Vincule e ative um padrão visual antes
              de publicar este checklist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            <AlertDialogCancel onClick={() => setPublishBlocker(null)}>
              Voltar ao bloco
            </AlertDialogCancel>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = publishBlocker?.blockId;
                  if (!id) return;
                  updateBlock(id, {
                    vision: {
                      ...((blocks.find((b: any) => b.id === id) as any)?.vision ?? {}),
                      enabled: false,
                    },
                  } as any);
                  setPublishBlocker(null);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700"
              >
                Desativar análise visual
              </button>
              <AlertDialogAction
                onClick={() => {
                  const id = publishBlocker?.blockId;
                  setPublishBlocker(null);
                  if (!id) return;
                  setActiveBlockId(id);
                  requestAnimationFrame(() => {
                    blockRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
                  });
                }}
              >
                Definir critérios
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CustomField({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-col">
        <label className="text-xs font-bold text-neutral-700">{label}</label>
        {description && <p className="text-[11px] text-neutral-500 leading-tight mb-1">{description}</p>}
      </div>
      <div className="pt-1">{children}</div>
    </div>
  );
}

function CustomColor({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">
        {label} {hint && <span className="text-neutral-400">(?)</span>}
      </label>
      <div className="flex items-center gap-2 border border-neutral-300 rounded-md px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-sm bg-transparent outline-none min-w-0"
        />
      </div>
    </div>
  );
}

function SettingsRow({
  title,
  description,
  control,
  badge,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
  badge?: { label: string; color: string };
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-6 py-5 border-b border-neutral-200 items-start">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          {badge && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.color}`}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500 max-w-md">{description}</p>
      </div>
      <div className="pt-1">{control}</div>
    </div>
  );
}

 function ImageBlock({
   src,
   variant,
   onChange,
   onRemove,
   position,
    onPositionChange,
    logoSettings,
  }: {
   src: string | null;
   variant?: "profile" | "cover";
   onChange: (src: string | null) => void;
   onRemove: () => void;
   position?: { x: number; y: number; zoom: number };
  onPositionChange?: (pos: { x: number; y: number; zoom: number }) => void;
  logoSettings?: {
    width: string;
    height: string;
    radius: string;
  };
}) {
  const [tab, setTab] = useState<"upload" | "link" | "unsplash">("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [imgDims, setImgDims] = useState<{ width: number, height: number } | null>(null);
  useCollapseOnOutside(wrapperRef, expanded, () => setExpanded(false));

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("A imagem é muito grande (máximo 10MB)");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onChange(reader.result);
          onPositionChange?.({ x: 0, y: 0, zoom: 1 });
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('checklist-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('checklist-assets')
        .getPublicUrl(filePath);

      // We append a timestamp to the URL to prevent browser caching from showing the old cropped version
      const finalUrl = `${publicUrl}?t=${Date.now()}`;
      onChange(finalUrl);
      onPositionChange?.({ x: 0, y: 0, zoom: 1 });
      toast.success("Imagem enviada!");
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error("Erro ao enviar imagem: " + error.message);
    }
  };

  if (src) {
    const containerStyle: React.CSSProperties = variant === "profile" 
      ? { width: logoSettings?.width || "128px", height: logoSettings?.height || "128px", borderRadius: logoSettings?.radius || "100%" }
      : { width: "100%", height: "320px" };
    const containerClass = variant === "profile" ? "overflow-hidden flex items-center justify-center" : "w-full h-80 overflow-hidden bg-neutral-100 dark:bg-neutral-800 transition-all duration-300 flex items-center justify-center";
    const zoom = position?.zoom || 1;
    const posX = position?.x || 0;
    const posY = position?.y || 0;

    const imgStyle: React.CSSProperties = {
      transform: `translate(${posX}px, ${posY}px) scale(${zoom})`,
      transformOrigin: "center center",
      objectFit: variant === "profile" ? "contain" : "none",
      width: variant === "profile" ? "100%" : "auto",
      height: variant === "profile" ? "100%" : "auto",
    };

    const imgClass = "w-full h-full";
 
    const isProfile = variant === "profile";

    return (
      <div className={`relative ${isProfile ? "group flex items-center justify-center px-12" : "group"}`}>
        {isProfile && !isEditingPosition && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const currentZoom = position?.zoom || 1;
              onPositionChange?.({ ...(position || { x: 0, y: 0, zoom: 1 }), zoom: Math.max(1, currentZoom - 0.1) });
            }}
            className="absolute left-6 p-1.5 bg-white rounded-full text-black hover:bg-neutral-50 shadow-lg border border-neutral-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95 z-30"

          >
            <Minus className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        )}

        <div 
          className={`relative ${containerClass} ${isEditingPosition ? "ring-2 ring-pink-500 cursor-move" : ""}`}
          style={containerStyle}
          onMouseDown={(e) => {
            if (!isEditingPosition || !imgRef.current) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const initialX = posX;
            const initialY = posY;
            setIsMoving(true);

            const onMouseMove = (moveEvent: MouseEvent) => {
              const dx = moveEvent.clientX - startX;
              const dy = moveEvent.clientY - startY;
              
              let newX = initialX + dx;
              let newY = initialY + dy;
              
              // Snapping to center (within 10px)
              if (Math.abs(newX) < 10) newX = 0;
              if (Math.abs(newY) < 10) newY = 0;
              
              onPositionChange?.({
                ...(position || { x: 0, y: 0, zoom: 1 }),
                x: newX,
                y: newY,
              });
            };

            const onMouseUp = () => {
              setIsMoving(false);
              window.removeEventListener("mousemove", onMouseMove);
              window.removeEventListener("mouseup", onMouseUp);
            };

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
          }}
        >
          <img 
            ref={imgRef}
            src={src} 
            alt="" 
            style={{
              ...imgStyle,
              pointerEvents: "none"
            }}
            className={`${imgClass} ${variant === "cover" ? "" : "border border-neutral-200"}`} 
          />
          
          {isEditingPosition && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              {/* Vertical Centering Guide */}
              <div 
                className={`absolute top-0 bottom-0 left-1/2 w-0.5 bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.5)] transition-opacity duration-150 ${
                  isMoving && Math.abs(posX) < 1 ? "opacity-100" : "opacity-0"
                }`} 
              />
              {/* Horizontal Centering Guide */}
              <div 
                className={`absolute top-1/2 left-0 right-0 h-0.5 bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.5)] transition-opacity duration-150 ${
                  isMoving && Math.abs(posY) < 1 ? "opacity-100" : "opacity-0"
                }`} 
              />
              
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 pointer-events-auto">
                <div 
                  data-controls
                  className="relative z-30 bg-white rounded-full shadow-lg px-4 py-2 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const currentZoom = position?.zoom || 1;
                      onPositionChange?.({ ...(position || { x: 0, y: 0, zoom: 1 }), zoom: Math.max(1, currentZoom - 0.1) });
                    }}
                    className="p-1 hover:bg-neutral-100 rounded-full transition-colors"
                  >
                    <Minus className="w-3 h-3 text-neutral-400 hover:text-neutral-600" />
                  </button>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="0.01"
                    value={position?.zoom || 1}
                    onChange={(e) => {
                      const newZoom = parseFloat(e.target.value);
                      onPositionChange?.({
                        ...(position || { x: 0, y: 0, zoom: 1 }),
                        zoom: newZoom,
                      });
                    }}
                    className="w-24 accent-pink-500 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const currentZoom = position?.zoom || 1;
                      const newZoom = Math.min(10, currentZoom + 0.1);
                      // Trigger the same clamping logic (simplified for button)
                      onPositionChange?.({ ...(position || { x: 0, y: 0, zoom: 1 }), zoom: newZoom });
                    }}
                    className="p-1 hover:bg-neutral-100 rounded-full transition-colors"
                  >
                    <Plus className="w-3 h-3 text-neutral-400 hover:text-neutral-600" />
                  </button>
                </div>
                <div className="w-px h-4 bg-neutral-200" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingPosition(false);
                  }}
                  className="text-xs font-bold text-neutral-900 hover:text-pink-600 transition-colors px-2 py-1"
                >
                  Pronto
                </button>
                </div>
              </div>
            </div>
          )}

          {!isEditingPosition && (
            <>
              <div 
                className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20 bg-black/40 ${isProfile ? "cursor-pointer" : ""}`}
                onClick={() => isProfile && fileInputRef.current?.click()}
              >
                {!isProfile && (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 bg-white rounded-full text-black hover:bg-neutral-50 shadow-sm transition-transform hover:scale-110"
                      title="Trocar imagem"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setIsEditingPosition(true)}
                      className="p-2 bg-white rounded-full text-black hover:bg-neutral-50 shadow-sm transition-transform hover:scale-110"
                      title="Ajustar posição"
                    >
                      <Move className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {variant !== "profile" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.();
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 border border-neutral-200 rounded-full shadow-sm text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-30"
                  title="Remover"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {isProfile && !isEditingPosition && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const currentZoom = position?.zoom || 1;
              onPositionChange?.({ ...(position || { x: 0, y: 0, zoom: 1 }), zoom: Math.min(3, currentZoom + 0.1) });
            }}
            className="absolute right-6 p-1.5 bg-white rounded-full text-black hover:bg-neutral-50 shadow-lg border border-neutral-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95 z-30"

          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        )}
      </div>
    );
  }

   if (variant === "profile" || variant === "cover") {
     const isProfile = variant === "profile";
     return (
       <button
         type="button"
         onClick={() => fileInputRef.current?.click()}
         onDragOver={(e) => e.preventDefault()}
         onDrop={(e) => {
           e.preventDefault();
           const f = e.dataTransfer.files?.[0];
           if (f) handleFile(f);
         }}
          className={
            isProfile
              ? "flex items-center justify-center w-24 h-24 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-colors text-neutral-300 shadow-sm"
              : "flex items-center justify-center w-full h-64 bg-neutral-100 hover:bg-neutral-200/70 transition-colors text-neutral-300"
          }
         aria-label={isProfile ? "Adicionar logo" : "Adicionar capa"}
       >
         <ImageIcon className={isProfile ? "w-6 h-6" : "w-5 h-5"} />
         <input
           ref={fileInputRef}
           type="file"
           accept="image/*"
           className="hidden"
           onChange={(e) => {
             const f = e.target.files?.[0];
             if (f) handleFile(f);
           }}
         />
       </button>
     );
   }

   if (!expanded) {
     return (
       <CollapsedMediaPlaceholder
         icon={ImageIcon}
         label="Adicionar uma imagem"
         onClick={() => setExpanded(true)}
       />
     );
   }

   return (
     <div ref={wrapperRef} className={`${variant === 'profile' ? 'w-64' : 'w-full'} rounded-md border border-neutral-200 bg-white`}>
      <div className="flex items-center gap-4 px-4 pt-3 text-sm border-b border-neutral-100">
        {(["upload", "link", "unsplash"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pb-2 -mb-px capitalize ${
              tab === t
                ? "text-neutral-900 border-b-2 border-neutral-900 font-medium"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {t === "upload" ? "Upload" : t === "link" ? "Link" : "Unsplash"}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "upload" && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className="w-full flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed border-neutral-200 rounded-md hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-500"
          >
            <Upload className="w-8 h-8" />
            <span className="text-sm font-medium text-neutral-700">
              Clique para escolher um arquivo ou arraste aqui
            </span>
            <span className="text-xs text-neutral-400">Limite de tamanho: 10 MB</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </button>
        )}
        {tab === "link" && (
          <div className="flex flex-col gap-2 py-6">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Cole a URL da imagem"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md outline-none focus:border-neutral-400"
            />
            <button
              type="button"
              disabled={!linkUrl.trim()}
              onClick={() => onChange(linkUrl.trim())}
              className="self-start px-3 py-1.5 text-sm bg-neutral-900 text-white rounded-md disabled:opacity-40"
            >
              Inserir imagem
            </button>
          </div>
        )}
        {tab === "unsplash" && (
          <div className="py-12 text-center text-sm text-neutral-400">
            Busca do Unsplash em breve.
          </div>
        )}
      </div>
    </div>
  );
}

function VideoBlock({
  src,
  onChange,
  onRemove,
}: {
  src: string | null;
  onChange: (src: string | null) => void;
  onRemove: () => void;
}) {
  const [linkUrl, setLinkUrl] = useState("");
  const [expanded, setExpanded] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useCollapseOnOutside(wrapperRef, expanded, () => setExpanded(false));

  const toEmbedUrl = (raw: string): { type: "iframe" | "video"; url: string } => {
    const url = raw.trim();
    // YouTube
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (yt) return { type: "iframe", url: `https://www.youtube.com/embed/${yt[1]}` };
    // Vimeo
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { type: "iframe", url: `https://player.vimeo.com/video/${vm[1]}` };
    // Loom
    const lm = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    if (lm) return { type: "iframe", url: `https://www.loom.com/embed/${lm[1]}` };
    // mp4 / webm / ogg
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return { type: "video", url };
    return { type: "iframe", url };
  };

  if (src) {
    const embed = toEmbedUrl(src);
    return (
      <div className="group relative w-full">
        <div className="w-full aspect-video rounded-md border border-neutral-200 overflow-hidden bg-black">
          {embed.type === "iframe" ? (
            <iframe
              src={embed.url}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video src={embed.url} controls className="w-full h-full" />
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/90 border border-neutral-200 rounded shadow-sm text-neutral-600 hover:text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Remover
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <CollapsedMediaPlaceholder
        icon={Video}
        label="Incorporar um vídeo"
        onClick={() => setExpanded(true)}
      />
    );
  }

  return (
    <div ref={wrapperRef} className="w-full rounded-md border border-neutral-200 bg-white">
      <div className="flex items-center gap-4 px-4 pt-3 text-sm border-b border-neutral-100">
        <button
          type="button"
          className="pb-2 -mb-px text-neutral-900 border-b-2 border-neutral-900 font-medium"
        >
          Embed link
        </button>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Cole o link do vídeo"
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          disabled={!linkUrl.trim()}
          onClick={() => onChange(linkUrl.trim())}
          className="w-full px-3 py-2 text-sm bg-neutral-900 text-white rounded-md disabled:opacity-40 font-medium"
        >
          Inserir vídeo
        </button>
        <p className="text-xs text-neutral-400 text-center">
          Funciona com YouTube, Vimeo, Loom, MP4s e mais
        </p>
      </div>
    </div>
  );
}


function useCollapseOnOutside(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, ref, onOutside]);
}

function EmbedBlock({
  src,
  onChange,
  onRemove,
}: {
  src: string | null;
  onChange: (src: string | null) => void;
  onRemove: () => void;
}) {
  const [linkUrl, setLinkUrl] = useState("");
  const [expanded, setExpanded] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useCollapseOnOutside(wrapperRef, expanded, () => setExpanded(false));

  if (src) {
    return (
      <div className="group relative w-full">
        <iframe
          src={src}
          className="w-full h-[480px] rounded-md border border-neutral-200 bg-white"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/90 border border-neutral-200 rounded shadow-sm text-neutral-600 hover:text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Remover
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <CollapsedMediaPlaceholder
        icon={Code}
        label="Incorporar qualquer coisa"
        onClick={() => setExpanded(true)}
      />
    );
  }

  return (
    <div ref={wrapperRef} className="w-full rounded-md border border-neutral-200 bg-white">
      <div className="flex items-center gap-4 px-4 pt-3 text-sm border-b border-neutral-100">
        <button
          type="button"
          className="pb-2 -mb-px text-neutral-900 border-b-2 border-neutral-900 font-medium"
        >
          Embed link
        </button>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Cole o link"
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          disabled={!linkUrl.trim()}
          onClick={() => onChange(linkUrl.trim())}
          className="w-full px-3 py-2 text-sm bg-neutral-900 text-white rounded-md disabled:opacity-40 font-medium"
        >
          Incorporar link
        </button>
        <p className="text-xs text-neutral-400 text-center">
          Funciona com links de PDFs, Calendly, Google Maps, Tweets, arquivos públicos do Figma e muito mais
        </p>
      </div>
    </div>
  );
}

function CollapsedMediaPlaceholder({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-500 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 hover:text-neutral-700 transition-colors text-left"
    >
      <Icon className="w-4 h-4 text-neutral-400" />
      <span>{label}</span>
    </button>
  );
}

function RatingStars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="group w-full flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const filled = n <= display;
        return (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? 0 : n)}
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star 
              className="w-8 h-8 transition-colors"
              style={{ 
                fill: filled ? "var(--accent-color)" : "transparent", 
                color: filled ? "var(--accent-color)" : "var(--input-border)" 
              }}
              strokeWidth={2} 
            />
          </button>
        );
      })}
    </div>
  );
}

function Item({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void }) {
  return (
    <li className="flex items-center gap-2 hover:text-neutral-900 cursor-pointer" onClick={onClick}>
      <Icon className="w-4 h-4 text-neutral-400" />
      <span>{label}</span>
    </li>
  );
}

function SignaturePad({ dataUrl, onChange }: { dataUrl: string | null; onChange: (v: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#171717";
    if (dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = dataUrl;
      hasDrawnRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = getPos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    hasDrawnRef.current = true;
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    if (canvasRef.current && hasDrawnRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    onChange(null);
  };

  return (
    <div className="group w-full">
      <div className="relative w-full rounded-md border border-dashed border-neutral-300 bg-white">
        <button
          type="button"
          onClick={clear}
          className="absolute top-2 right-3 text-sm text-neutral-700 hover:text-neutral-900 z-10"
        >
          Clear
        </button>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block w-full h-40 cursor-crosshair touch-none"
        />
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-2 pointer-events-none">
          <div className="w-[80%] border-t border-neutral-300 mb-1" />
          <span className="text-sm text-neutral-400">Signature</span>
        </div>
      </div>
    </div>
  );
}
