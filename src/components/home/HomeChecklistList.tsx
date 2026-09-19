import type { ReactNode } from "react";
import {
  CheckSquare,
  CircleCheck,
  CircleDashed,
  Copy as CopyIcon,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/dashboard/kit/ui/card";
import { Checkbox } from "@/components/dashboard/kit/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dashboard/kit/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAssignmentStatus, getStatusBadge } from "@/utils/assignment-status";

/**
 * Home 6B.2L — lista principal da Home em UMA superfície única (borda externa +
 * divisores entre linhas), na densidade da referência aprovada: sem card
 * individual, sem ícone decorativo à esquerda, poucas ações e todas
 * concentradas à direita.
 *
 * ANATOMIA DA LINHA (dados REAIS, nada inventado) — UMA linha visual:
 *   esquerda → título + badges de status operacional (`getAssignmentStatus` +
 *              `getStatusBadge`, rótulo real SEM data; o prazo real segue no
 *              tooltip da tag, sem ícone);
 *   direita  → data real que a Home já exibia (`updated_at || created_at`),
 *              indicador de publicação (`is_published`: check verde ou círculo
 *              tracejado neutro, tooltip/aria-label — NÃO é ação, a linha
 *              inteira abre) e o menu `...` com as ações administrativas reais.
 *
 * É apresentação pura: consulta, permissão e destinos vêm da rota via props.
 */

export type HomeChecklistListActions = {
  /** Ação principal (RBAC-aware, decidida na rota). */
  onOpen: (item: any) => void;
  onToggleSelect: (id: string) => void;
  onSettings: (item: any) => void;
  onEdit: (item: any) => void;
  onSelect: (item: any) => void;
  onRename: (item: any) => void;
  onCopyLink: (item: any) => void;
  onDuplicate: (item: any) => void;
  onDelete: (item: any) => void;
};

/** Badge pequeno e discreto (outline seco). */
function MiniBadge({
  children,
  className,
  title,
  testId,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  testId?: string;
}) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Estilo LOCAL dos badges de status — apenas apresentação da Home (menores,
 * menos saturados, sem ícone), na linguagem da referência. O RÓTULO continua
 * vindo de `getStatusBadge`; nenhuma segunda regra de status é criada aqui.
 */
const SOFT_STATUS_CLASS: Record<string, string> = {
  concluido: "border-green-200/70 bg-green-50/70 text-green-700",
  atrasado: "border-rose-200/70 bg-rose-50/70 text-rose-700",
  pendente: "border-blue-200/70 bg-blue-50/70 text-blue-700",
};

function checklistTitle(item: any): string {
  return typeof item?.title === "string" && item.title.trim().length > 0
    ? item.title
    : "Checklist sem título";
}

export function HomeChecklistList({
  checklists,
  canManage,
  selectionMode,
  selectedIds,
  actions,
  emptyState,
  filtered = false,
}: {
  checklists: any[];
  canManage: boolean;
  selectionMode: boolean;
  selectedIds: string[];
  actions: HomeChecklistListActions;
  /** Estado vazio REAL (nenhum checklist no recorte/contexto). */
  emptyState: { title: string; description: string; onCreate?: () => void };
  /** Verdadeiro quando um filtro local está aplicado sobre a lista. */
  filtered?: boolean;
}) {
  if (checklists.length === 0) {
    // Filtro sem resultado é uma mensagem curta — não é o vazio da Home.
    if (filtered) {
      return (
        <Card
          data-testid="home-checklists-filter-empty"
          className="gap-0 items-center rounded-xl border-dashed border-neutral-200 py-0 shadow-none"
        >
          <div className="w-full px-6 py-10 text-center">
            <p className="text-sm font-medium text-neutral-700">Nenhum checklist neste filtro.</p>
            <p className="mt-1 text-xs text-neutral-500">
              Ajuste o filtro para ver outros checklists deste contexto.
            </p>
          </div>
        </Card>
      );
    }

    return (
      <Card
        data-testid="home-checklists-empty"
        className="gap-0 items-center rounded-xl border-dashed border-neutral-200 py-0 shadow-none"
      >
        <div className="flex w-full flex-col items-center px-6 py-12 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-400">
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-neutral-900">{emptyState.title}</h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-500">{emptyState.description}</p>
          {emptyState.onCreate && (
            <button
              type="button"
              data-testid="home-empty-new-checklist"
              onClick={emptyState.onCreate}
              className="mt-5 cursor-pointer rounded-md bg-[#FF007F] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#FF007F]/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Novo checklist
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      data-testid="home-checklist-list"
      data-count={checklists.length}
      className="gap-0 overflow-hidden rounded-xl border-neutral-200 py-0 shadow-none"
    >
      {checklists.map((item, index) => {
        const selected = selectedIds.includes(item.id);
        const title = checklistTitle(item);
        const assignments: any[] = Array.isArray(item?.checklist_assignments)
          ? item.checklist_assignments
          : [];
        // Todos os estados REAIS dos assignments, agora na PRIMEIRA linha ao
        // lado do título (sem deduplicação por heurística e sem esconder
        // informação). Rótulo do helper canônico; estilo local suave, sem
        // ícone e SEM data no texto — o prazo real segue no tooltip da tag.
        const statuses = assignments
          .map((assignment: any) => {
            const status = getAssignmentStatus(
              assignment?.due_at ?? null,
              assignment?.completed_at ?? null,
            );
            const badge = getStatusBadge(status);
            if (!badge) return null;
            const due = assignment?.due_at
              ? new Date(assignment.due_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })
              : null;
            return {
              key: assignment.id,
              label: badge.label,
              due,
              className: SOFT_STATUS_CLASS[status],
            };
          })
          .filter(Boolean) as { key: string; label: string; due: string | null; className: string }[];

        return (
          <div
            key={item.id}
            data-testid="home-checklist-row"
            data-checklist-id={item.id}
            data-selected={selected ? "true" : "false"}
            onClick={() => (selectionMode ? actions.onToggleSelect(item.id) : actions.onOpen(item))}
            className={cn(
              "group flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-muted/30",
              index > 0 && "border-t border-neutral-100",
              selectionMode && selected && "bg-muted/50",
            )}
          >
            {selectionMode && (
              <Checkbox
                data-testid="home-checklist-checkbox"
                aria-label={`Selecionar ${title}`}
                checked={selected}
                onCheckedChange={() => actions.onToggleSelect(item.id)}
                onClick={(event) => event.stopPropagation()}
                className="data-[state=checked]:border-[#FF007F] data-[state=checked]:bg-[#FF007F]"
              />
            )}

            <div className="min-w-0 flex-1 basis-[65%]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="home-checklist-title"
                  aria-label={selectionMode ? `Selecionar ${title}` : `Abrir ${title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectionMode) actions.onToggleSelect(item.id);
                    else actions.onOpen(item);
                  }}
                  className="cursor-pointer truncate rounded-sm text-left text-sm font-medium text-neutral-900 underline-offset-2 transition-colors hover:text-[#FF007F] focus-visible:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {title}
                </button>

                {/* Status operacional REAL na primeira linha, junto ao título
                    (texto puro, sem ícone e sem data visível; o prazo real
                    permanece no tooltip; wrap natural para múltiplos). */}
                {statuses.map((status) => (
                  <MiniBadge
                    key={status.key}
                    className={status.className}
                    title={status.due ? `Prazo: ${status.due}` : undefined}
                  >
                    {status.label}
                  </MiniBadge>
                ))}
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
              <span
                data-testid="home-checklist-date"
                className="text-xs whitespace-nowrap tabular-nums text-muted-foreground"
              >
                {new Date(item.updated_at || item.created_at).toLocaleDateString("pt-BR")}
              </span>

              {/* Indicador de publicação (is_published) — NÃO é ação: a linha
                  inteira já abre o checklist. Check verde discreto quando
                  publicado; círculo TRACEJADO neutro quando não. Significado
                  via tooltip + aria-label, sem texto permanente. */}
              <span
                role="img"
                data-testid="home-checklist-publication"
                title={item.is_published ? "Publicado" : "Não publicado"}
                aria-label={item.is_published ? "Publicado" : "Não publicado"}
                className={cn(
                  "flex items-center p-1.5",
                  item.is_published ? "text-green-600" : "text-neutral-300",
                )}
              >
                {item.is_published ? (
                  <CircleCheck className="h-4 w-4" />
                ) : (
                  <CircleDashed className="h-4 w-4" />
                )}
              </span>

              {!selectionMode && canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="home-checklist-menu"
                      aria-label={`Ações de ${title}`}
                      onClick={(event) => event.stopPropagation()}
                      className="cursor-pointer rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => actions.onSettings(item)}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Configurações</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => actions.onEdit(item)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span>Editar</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => actions.onSelect(item)}
                    >
                      <CheckSquare className="h-4 w-4" />
                      <span>Selecionar</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => actions.onRename(item)}
                    >
                      <FileText className="h-4 w-4" />
                      <span>Renomear</span>
                    </DropdownMenuItem>
                    {item.is_published && (
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => actions.onCopyLink(item)}
                      >
                        <Link2 className="h-4 w-4" />
                        <span>Copiar link</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => actions.onDuplicate(item)}
                    >
                      <CopyIcon className="h-4 w-4" />
                      <span>Duplicar</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600"
                      onClick={() => actions.onDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Excluir</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
