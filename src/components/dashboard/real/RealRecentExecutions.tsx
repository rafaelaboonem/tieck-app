/*
 * ==================== ÚLTIMAS EXECUÇÕES ==================================
 *
 * Shell do `RecentTransactions` do template MIT
 * `shadcn-dashboard-landing-template` (app/dashboard-2): Card, header com
 * descrição, linhas `rounded-lg border` com Avatar + nome/contexto + Badge de
 * status + metadados à direita.
 *
 * SEMÂNTICA DA SEÇÃO (não misturar): aqui só entra checklist REALMENTE
 * RESPONDIDO/CONCLUÍDO. Ocorrência pendente, futura ou aberta sem resposta
 * pertence a "Rotinas agendadas" ou "Pontos de atenção" — nunca a este card.
 * Quem alimenta `items` é responsável por esse recorte.
 *
 * FONTE REAL (6B.2E): `/painel` consulta
 * `list_workspace_recent_checklist_executions` — occurrences de rotinas
 * agendadas com `completed_at` e `response_id` — e passa as execuções já no
 * contrato deste componente. O recorte é do painel (período + unidade opcional +
 * turno opcional) e nada é fabricado: sem fonte, sem dado, o card mostra estado
 * vazio honesto; falha de leitura mostra estado de erro (nunca "sem execuções").
 *
 * ESTADOS: loading (esqueleto) → erro (com retry) → vazio — nessa ordem, para
 * que uma resposta pendente ou uma falha jamais sejam lidas como "nada
 * aconteceu na operação".
 *
 * INTERAÇÃO: o avatar é o controle da PESSOA — hover/focus mostra o nome
 * (Tooltip) e o clique abre o drawer lateral com o resumo da execução. A linha
 * mantém a ação própria (`onOpen`), e o clique no avatar NÃO dispara a da linha.
 *
 * =========================================================================
 */

import * as React from "react";
import { Eye, MoreHorizontal } from "lucide-react";

import { MemberAvatar } from "@/components/member/MemberAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AvatarDisplayMode } from "@/lib/member-avatar-preference";
import { Badge } from "../kit/ui/badge";
import { Button } from "../kit/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../kit/ui/dropdown-menu";
import { RecentExecutionDrawer } from "./RecentExecutionDrawer";

export type ExecutionStatusTone = "done" | "pending" | "failed";

export type RecentExecution = {
  /** Id estável da LINHA (execução/ocorrência) — nunca o id do checklist. */
  id: string;
  /** Nome do checklist respondido (linha principal). */
  checklist: string;
  /** Rótulo exibido/acessível do avatar: o nome quando identificado. */
  executor: string;
  /**
   * Identidade estável do EXECUTOR (`workspace_members.user_id` ou
   * `workspace_members.id`). É o seed do avatar ilustrado: mesma pessoa → mesmo
   * avatar. Sem ela, o avatar cai nas iniciais — nunca sorteia.
   */
  memberId?: string;
  /** Unidade / contexto (linha secundária). */
  context: string;
  statusLabel: string;
  statusTone: ExecutionStatusTone;
  /** Data/hora real da resposta (linha pequena à direita). */
  occurredAt: string;
  /** Tempo relativo real (linha de destaque à direita). */
  relative: string;
  avatarUrl?: string;
  /**
   * Escolha EXPLÍCITA de como a pessoa quer aparecer (photo | automatic |
   * illustrated). Sem ela o MemberAvatar aplica a precedência histórica
   * (foto → escolhido → automático), o que atenderia mal quem escolheu uma
   * ilustração tendo foto: aqui o modo REAL do membro sempre viaja junto.
   */
  avatarDisplayMode?: AvatarDisplayMode | null;
  /** Ilustração escolhida manualmente ("avatar-14") — vale no modo illustrated. */
  selectedAvatarId?: string | null;

  /* ------------------------- identidade (drawer) ------------------------- */
  /**
   * `false` quando NÃO existe identidade confiável de quem executou (ex.:
   * resposta avulsa). O drawer escreve "Respondente não identificado" em vez de
   * associar um avatar arbitrário. Ausente = identificado.
   */
  executorIdentified?: boolean;
  /** Nome real do executor, quando a identidade é confiável. */
  executorName?: string;
  /** Responsável ATRIBUÍDO — conceito separado do executor. */
  assignedName?: string;
  assignedMemberId?: string;
  /** Papel no workspace (owner|admin|editor|viewer) — NÃO é cargo. */
  roleLabel?: string;

  /* --------------------------- vínculo (drawer) -------------------------- */
  /**
   * Id REAL do checklist de origem. Obrigatório para existir "Ver Checklist";
   * sem ele o drawer não oferece ação nenhuma (nada de navegar por título).
   */
  checklistId?: string;
  occurrenceId?: string;
  responseId?: string;

  /* ------------------------- recorte operacional ------------------------ */
  unitId?: string;
  unitName?: string;
  shiftId?: string;
  shiftName?: string;
  /** ISO — previsto e concluído (o drawer formata em HH:MM). */
  dueAt?: string;
  completedAt?: string;
  /** Rótulo real de resultado/conformidade, quando existir. */
  resultLabel?: string;
  compliancePercentage?: number;
};

export function RealRecentExecutions({
  items,
  description,
  unavailable,
  loading = false,
  error = false,
  onRetry,
  onOpen,
  onOpenChecklist,
  className,
}: {
  items: RecentExecution[];
  description: string;
  /**
   * Sem fonte de dados conectada: estado honesto, nunca linhas inventadas.
   * Opcional — quando já existem itens, o vazio não é usado.
   */
  unavailable?: { title: string; helper: string };
  /** Leitura em andamento — esqueleto no lugar das linhas (nunca "vazio"). */
  loading?: boolean;
  /**
   * A leitura FALHOU. É um estado próprio de propósito: uma falha de contrato
   * não pode ser apresentada como "nenhuma execução no período".
   */
  error?: boolean;
  /** Retry do padrão do produto (o painel passa o refresh do hook real). */
  onRetry?: () => void;
  /** Só passa a existir ação de abrir quando existir rota real. */
  onOpen?: (id: string) => void;
  /**
   * Navegação para o checklist de origem (`/checklist?id=…`). O botão
   * "Ver Checklist" só aparece quando existem os DOIS: a ação e o `checklistId`
   * do item.
   */
  onOpenChecklist?: (checklistId: string) => void;
  /** Classe extra no Card (ex.: microinteração de hover do preview). */
  className?: string;
}) {
  const [detail, setDetail] = React.useState<RecentExecution | null>(null);
  // Devolve o foco ao avatar que abriu o drawer (o Sheet já faz sozinho; aqui é
  // explícito para também valer quando o item sai da lista).
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const closeDrawer = (open: boolean) => {
    if (!open) setDetail(null);
  };

  return (
    <Card className={[onOpen ? "cursor-pointer" : undefined, className].filter(Boolean).join(" ") || undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Últimas execuções</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {onOpen && (
          <Button variant="outline" size="sm" className="cursor-pointer">
            <Eye className="h-4 w-4 mr-2" />
            Ver todos
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && items.length === 0 ? (
          // Leitura em andamento: esqueleto com a MESMA estrutura da linha real.
          <div data-testid="recent-executions-loading" className="space-y-4">
            {[0, 1, 2].map((key) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          // Falha de leitura NÃO é vazio: o texto e a ação são outros.
          <div data-testid="recent-executions-error" className="rounded-lg border p-3">
            <p className="text-sm font-medium">
              Não foi possível carregar as últimas execuções.
            </p>
            <p className="text-xs text-muted-foreground">
              A leitura das execuções concluídas falhou no recorte selecionado.
            </p>
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 cursor-pointer"
                onClick={onRetry}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {unavailable?.title ?? "Sem execuções no período"}
              </p>
              <p className="text-xs text-muted-foreground">
                {unavailable?.helper ??
                  "Nenhuma rotina foi concluída no recorte selecionado."}
              </p>
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={150}>
            {items.map((item) => {
              const personLabel = item.executorIdentified === false
                ? item.executor
                : (item.executorName ?? item.executor);
              // Segunda linha do tooltip SÓ com dado real (unidade do item).
              const tooltipUnit = item.unitName ?? null;

              return (
                <div key={item.id}>
                  <div
                    className="flex p-3 rounded-lg border gap-2"
                    onClick={onOpen ? () => onOpen(item.id) : undefined}
                  >
                    {/*
                     * Identidade pelo MemberAvatar oficial: foto real quando
                     * existir, senão o avatar ilustrado estável da pessoa
                     * (seed = memberId) e, na falta dele, as iniciais do helper
                     * único do produto ("Maria Vitória Souza" → "MS").
                     *
                     * O avatar é o controle da PESSOA (hover = quem é; clique =
                     * detalhes). A ação da LINHA continua sendo `onOpen`, e o
                     * clique aqui não pode disparar as duas.
                     */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Ver detalhes de ${personLabel}`}
                          data-testid={`recent-execution-avatar-${item.id}`}
                          className="ti-avatar-btn shrink-0 cursor-pointer focus-visible:outline-none"
                          onClick={(event) => {
                            // A linha também é clicável (`onOpen`): o avatar não
                            // pode abrir o drawer E acionar a ação da linha.
                            event.stopPropagation();
                            event.preventDefault();
                            triggerRef.current = event.currentTarget;
                            setDetail(item);
                          }}
                        >
                          <MemberAvatar
                            size="sm"
                            memberId={item.memberId}
                            displayName={item.executor}
                            avatarUrl={item.avatarUrl}
                            avatarDisplayMode={item.avatarDisplayMode}
                            selectedAvatarId={item.selectedAvatarId}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-center">
                        <span className="block font-medium">{personLabel}</span>
                        {tooltipUnit && (
                          <span className="block text-[11px] opacity-80">{tooltipUnit}</span>
                        )}
                      </TooltipContent>
                    </Tooltip>

                    <div className="flex flex-1 items-center flex-wrap justify-between gap-1">
                      <div className="flex items-center space-x-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.checklist}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.context}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge
                          variant={
                            item.statusTone === "done"
                              ? "default"
                              : item.statusTone === "pending"
                                ? "secondary"
                                : "destructive"
                          }
                          className="cursor-pointer"
                        >
                          {item.statusLabel}
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-medium">{item.relative}</p>
                          <p className="text-xs text-muted-foreground">{item.occurredAt}</p>
                        </div>
                        {onOpen && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => onOpen(item.id)}
                              >
                                Abrir execução
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </TooltipProvider>
        )}
      </CardContent>

      <RecentExecutionDrawer
        execution={detail}
        onOpenChange={closeDrawer}
        onOpenChecklist={onOpenChecklist}
        onReturnFocus={() => triggerRef.current?.focus()}
      />
    </Card>
  );
}
