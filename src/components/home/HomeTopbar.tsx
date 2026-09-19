import { FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/dashboard/kit/ui/button";
import { cn } from "@/lib/utils";
import logoUrl from "../../assets/local/logo-k.webp";

/**
 * Home 6B.2L — topbar da `/inicio`.
 *
 * Composição "editorial": logo COMPACTA + breadcrumb discreto do contexto real
 * (`workspaceStatus`) à esquerda; ações à direita. Continua dentro do shell
 * atual (`DashboardLayout`), preservando o deslocamento lateral quando o rail
 * está recolhido.
 *
 * Sem busca aqui: o sistema global de busca (`open-search` / Command Menu)
 * permanece no shell, e a Home não renderiza um segundo gatilho.
 *
 * As duas ações são REAIS — quem decide permissão e destino é a rota:
 *   • "Novo workspace" → abre o diálogo de criação JÁ existente no shell;
 *   • "+ Novo checklist" → mesmo `handleNew` que a Home sempre usou.
 */
export function HomeTopbar({
  workspaceLabel,
  isMobile,
  sidebarOpen,
  canCreateWorkspace,
  onCreateWorkspace,
  canCreateChecklist,
  onCreateChecklist,
}: {
  /** Nome REAL do contexto: `currentWorkspace.name` ou "Pessoal". */
  workspaceLabel: string;
  isMobile: boolean;
  sidebarOpen: boolean;
  canCreateWorkspace: boolean;
  onCreateWorkspace: () => void;
  canCreateChecklist: boolean;
  onCreateChecklist: () => void;
}) {
  return (
    <header
      data-testid="home-topbar"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 transition-all duration-300",
          !sidebarOpen && !isMobile && "pl-14",
          isMobile && !sidebarOpen && "pl-12",
        )}
      >
        <img
          src={logoUrl}
          alt="Tieck"
          className="h-7 w-7 shrink-0 cursor-pointer object-contain grayscale transition-all hover:grayscale-0"
        />
        <span aria-hidden="true" className="text-neutral-300">
          ›
        </span>
        <span
          data-testid="home-workspace-label"
          className="truncate text-sm font-medium text-neutral-600"
        >
          {workspaceLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canCreateWorkspace && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="home-new-workspace"
            onClick={onCreateWorkspace}
            className="h-8 gap-1.5 border-neutral-200 bg-white text-xs font-medium text-neutral-700 shadow-none hover:bg-neutral-50"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Novo workspace
          </Button>
        )}

        {canCreateChecklist && (
          <Button
            type="button"
            size="sm"
            data-testid="home-new-checklist"
            onClick={onCreateChecklist}
            className="h-8 gap-1.5 bg-[#FF007F] text-xs font-semibold text-white shadow-none hover:bg-[#FF007F]/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo checklist
          </Button>
        )}
      </div>
    </header>
  );
}
