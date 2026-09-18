/*
 * ================== DRAWER DE UMA EXECUÇÃO ("ÚLTIMAS EXECUÇÕES") ==========
 *
 * Drawer lateral (Sheet oficial do produto — o MESMO usado por
 * `TaskExecutionDetailDrawer`) aberto pelo avatar de uma linha de
 * "Últimas execuções".
 *
 * Regras de conteúdo (auditadas, sem inventar dado):
 *   • a PESSOA aparece sempre, em duas linhas separadas — "Responsável
 *     atribuído" e "Executado por" são conceitos distintos mesmo quando hoje,
 *     nas rotinas, forem a mesma pessoa;
 *   • quando não existe identidade confiável de quem executou (resposta
 *     avulsa), o texto é "Respondente não identificado" — nunca um avatar
 *     arbitrário associado à resposta;
 *   • os campos de execução só aparecem QUANDO EXISTEM. Nada de "—" de
 *     preenchimento, nada de score/cargo/horário inventado;
 *   • "Ver Checklist" só existe com `checklistId` REAL + ação do host. Sem os
 *     dois, o rodapé não oferece botão nenhum (e nunca navega por título).
 *
 * Papel no workspace (owner|admin|editor|viewer) é "Papel no workspace" — o
 * banco não tem cargo/job title, então o rótulo "Cargo" não é usado.
 * =========================================================================
 */
import { FileText } from "lucide-react";

import { MemberAvatar } from "@/components/member/MemberAvatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { RecentExecution } from "./RealRecentExecutions";

/** HH:MM de um ISO; se o valor não for data válida, mostra como veio. */
function timeLabel(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function personName(item: RecentExecution): string {
  if (item.executorIdentified === false) return "Respondente não identificado";
  return item.executorName ?? item.executor;
}

/** Linha de execução — só é renderizada quando o dado existe de verdade. */
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div data-testid={`drawer-field-${label.toLowerCase()}`}>
      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

/** Linha de identidade — sempre presente: ausência de dado também informa. */
function PersonField({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

export function RecentExecutionDrawer({
  execution,
  onOpenChange,
  onOpenChecklist,
  onReturnFocus,
}: {
  execution: RecentExecution | null;
  onOpenChange: (open: boolean) => void;
  onOpenChecklist?: (checklistId: string) => void;
  /**
   * Devolve o foco ao avatar que abriu. O Radix restauraria o foco sozinho, mas
   * aqui o "trigger" é um botão comum da linha (não um `Dialog.Trigger`), então
   * a devolução é explícita — e o default do Radix é cancelado para não brigar.
   */
  onReturnFocus?: () => void;
}) {
  const open = !!execution;
  const checklistId = execution?.checklistId;

  // Só existe ação quando existem os DOIS: o id REAL do checklist e a navegação
  // do host. Item sem `checklistId` não oferece botão falso.
  const canOpenChecklist = !!checklistId && !!onOpenChecklist;

  // Subtítulo do cabeçalho: só o recorte REAL (unidade/turno). Papel é campo
  // próprio abaixo, porque o vocabulário do produto é "Papel no workspace".
  const meta = execution
    ? [execution.unitName, execution.shiftName].filter(Boolean).join(" · ")
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="recent-execution-drawer"
        className="w-full overflow-y-auto sm:max-w-[420px]"
        onCloseAutoFocus={(event) => {
          if (!onReturnFocus) return;
          event.preventDefault();
          onReturnFocus();
        }}
      >
        {execution && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <MemberAvatar
                  size="xl"
                  memberId={execution.executorIdentified === false ? undefined : execution.memberId}
                  displayName={execution.executorIdentified === false ? undefined : personName(execution)}
                  avatarUrl={execution.executorIdentified === false ? undefined : execution.avatarUrl}
                  // A preferência REAL do membro viaja junto: quem escolheu uma
                  // ilustração tendo foto continua vendo a ilustração aqui.
                  avatarDisplayMode={
                    execution.executorIdentified === false ? undefined : execution.avatarDisplayMode
                  }
                  selectedAvatarId={
                    execution.executorIdentified === false ? undefined : execution.selectedAvatarId
                  }
                />
                <div className="min-w-0">
                  <SheetTitle className="text-left">
                    {personName(execution)}
                  </SheetTitle>
                  {meta && (
                    <SheetDescription className="text-left">{meta}</SheetDescription>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="mt-5 space-y-6 text-sm">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Pessoas
                </h3>
                <dl className="grid grid-cols-2 gap-3">
                  {/* Só existe quando há responsável REAL: ausência de dado não
                      vira um "Não registrado" de enfeite. */}
                  {execution.assignedName && (
                    <PersonField
                      label="Responsável atribuído"
                      value={execution.assignedName}
                      testId="drawer-assigned"
                    />
                  )}
                  <PersonField
                    label="Executado por"
                    value={personName(execution)}
                    testId="drawer-executor"
                  />
                  {/* owner|admin|editor|viewer do workspace — não é cargo: o
                      banco não tem job title, então o rótulo não promete um. */}
                  {execution.roleLabel && (
                    <Field label="Papel no workspace" value={execution.roleLabel} />
                  )}
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Execução
                </h3>
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Checklist" value={execution.checklist} />
                  <Field label="Unidade" value={execution.unitName ?? null} />
                  <Field label="Turno" value={execution.shiftName ?? null} />
                  <Field label="Status" value={execution.statusLabel} />
                  <Field label="Previsto" value={timeLabel(execution.dueAt)} />
                  <Field label="Concluído" value={timeLabel(execution.completedAt)} />
                  <Field label="Resultado" value={execution.resultLabel ?? null} />
                  <Field
                    label="Conformidade"
                    value={
                      typeof execution.compliancePercentage === "number"
                        ? `${execution.compliancePercentage}%`
                        : null
                    }
                  />
                </dl>
              </section>
            </div>

            {canOpenChecklist && (
              <div className="mt-6 border-t pt-4">
                <Button
                  className="w-full cursor-pointer"
                  data-testid="drawer-open-checklist"
                  onClick={() => {
                    // Fecha o drawer e só então navega para o checklist REAL.
                    onOpenChange(false);
                    onOpenChecklist!(checklistId!);
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Ver Checklist
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
