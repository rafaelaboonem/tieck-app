/*
 * ==================== ÚLTIMAS EXECUÇÕES (SLOT RESERVADO) ===================
 *
 * Shell do `RecentTransactions` do template MIT
 * `shadcn-dashboard-landing-template` (app/dashboard-2): Card, header com
 * descrição, linhas `rounded-lg border` com Avatar + nome/contexto + Badge de
 * status + metadados à direita.
 *
 * Este é o componente RESERVADO para "checklists efetivamente respondidos" —
 * ele NÃO hospeda atenção/exceção operacional (conceitos diferentes).
 *
 * Estado atual da fonte de dados (auditado, sem consulta nova nesta etapa):
 * `/painel` carrega apenas agregados (`analytics_unit_daily_compliance`,
 * `analytics_unit_daily_occurrences`). Nenhum contrato JÁ carregado pelo painel
 * devolve resposta individual de checklist. `checklist_responses` existe no
 * schema com id, checklist_id, visitor_id, answers, created_at, submitted_at e
 * expires_at — sem unidade, sem responsável nomeado, sem "no prazo/atraso".
 * Portanto: com `items` vazio o componente mostra um estado honesto de
 * indisponibilidade (mesmo Card/estrutura), e nenhuma execução é fabricada.
 * A versão preenchida continua disponível na bancada (`?uiPreview=1`).
 *
 * O DropdownMenu (View Details / Download Receipt / Contact Customer) e o
 * botão "View All" do template só aparecem quando existe ação real
 * (`onOpen` / `viewAll`) — sem botão falso.
 * =========================================================================
 */

import { Eye, MoreHorizontal } from "lucide-react";

import { MemberAvatar } from "@/components/member/MemberAvatar";
import { Badge } from "../kit/ui/badge";
import { Button } from "../kit/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../kit/ui/dropdown-menu";

export type ExecutionStatusTone = "done" | "pending" | "failed";

export type RecentExecution = {
  id: string;
  /** Nome do checklist respondido (linha principal). */
  checklist: string;
  /** Responsável/executor — nome exibido/acessível do Avatar. */
  executor: string;
  /**
   * Identidade estável do responsável (`workspace_members.user_id` ou
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
};

export function RealRecentExecutions({
  items,
  description,
  unavailable,
  onOpen,
  className,
}: {
  items: RecentExecution[];
  description: string;
  /**
   * Sem fonte de dados conectada: estado honesto, nunca linhas inventadas.
   * Opcional — quando já existem itens, o vazio não é usado.
   */
  unavailable?: { title: string; helper: string };
  /** Só passa a existir ação de abrir quando existir rota real. */
  onOpen?: (id: string) => void;
  /** Classe extra no Card (ex.: microinteração de hover do preview). */
  className?: string;
}) {
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
        {items.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {unavailable?.title ?? "Sem execuções no período"}
              </p>
              <p className="text-xs text-muted-foreground">
                {unavailable?.helper ??
                  "Nenhum checklist foi respondido no recorte selecionado."}
              </p>
            </div>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id}>
              <div
                className="flex p-3 rounded-lg border gap-2"
                onClick={onOpen ? () => onOpen(item.id) : undefined}
              >
                {/*
                 * Identidade pelo MemberAvatar oficial: foto real quando existir,
                 * senão o avatar ilustrado estável da pessoa (seed = memberId) e,
                 * na falta dele, as iniciais do helper único do produto
                 * ("Maria Vitória Souza" → "MS"). O `alt` continua sendo o nome
                 * porque nesta linha o responsável NÃO aparece escrito ao lado.
                 */}
                <MemberAvatar
                  size="sm"
                  memberId={item.memberId}
                  displayName={item.executor}
                  avatarUrl={item.avatarUrl}
                />
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
