import { Camera, Sparkles, Loader2, MoreVertical, GripVertical } from "lucide-react";
import { CameraVerificationPolicyV1, PublishedBlock } from "@/server/camera-ai/schema";
import { cn } from "@/lib/utils";

interface CameraBlockCardProps {
  block: PublishedBlock;
  isActive: boolean;
  isCompiling: boolean;
  textColor: string;
  onSelect: () => void;
}

export function CameraBlockCard({
  block,
  isActive,
  isCompiling,
  textColor,
  onSelect,
}: CameraBlockCardProps) {
  const policy = block.cameraAiPolicy as CameraVerificationPolicyV1 | undefined;
  const title = block.title || block.subtitle || "Câmera";
  
  const getBadge = () => {
    if (isCompiling) {
      return { label: "Preparando verificação...", variant: "compiling" as const };
    }
    if (!policy) {
      return { label: "Configuração pendente", variant: "pending" as const };
    }
    
    switch (policy.verifiability) {
      case 'not_visual':
        return { label: "Não verificável somente por foto", variant: "not_visual" as const };
      case 'partially_visual':
        return { label: "Verificação parcial", variant: "partial" as const };
      case 'visual':
      default:
        return { label: "Verificação por IA", variant: "valid" as const };
    }
  };

  const badge = getBadge();

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 w-full border rounded-xl px-4 py-3 bg-white hover:bg-neutral-50 transition-all relative group shadow-sm cursor-pointer",
        isActive ? "ring-2 ring-pink-500 border-pink-500" : "border-neutral-200"
      )}
    >
      <div className="flex items-center self-stretch mr-1 text-neutral-300 group-hover:text-neutral-400">
        <GripVertical className="w-4 h-4 cursor-grab active:cursor-grabbing" />
      </div>

      <div 
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" 
        style={{ backgroundColor: `${textColor}1A` }}
      >
        <Camera className="w-5 h-5" style={{ color: textColor }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 
            className="text-sm font-bold truncate"
            style={{ color: textColor }}
          >
            {title}
          </h3>
          
          {badge && (
            <div className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
              badge.variant === 'valid' && "bg-green-100 text-green-700",
              badge.variant === 'compiling' && "bg-blue-100 text-blue-700 animate-pulse",
              (badge.variant === 'partial' || badge.variant === 'not_visual') && "bg-amber-100 text-amber-700",
              badge.variant === 'pending' && "bg-neutral-100 text-neutral-600"
            )}>
              {badge.variant === 'compiling' ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Sparkles className="w-2.5 h-2.5" />
              )}
              {badge.label}
            </div>
          )}
        </div>

        {policy?.summary && (
          <p className="text-[11px] text-neutral-500 line-clamp-1">
            {policy.summary}
          </p>
        )}
      </div>

      <button 
        aria-label="Opções do bloco"
        onClick={(e) => {
          e.stopPropagation();
          // TODO: Conectar ao menu de blocos padrão do editor
        }}
        className="p-1 rounded-md hover:bg-neutral-100 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}
