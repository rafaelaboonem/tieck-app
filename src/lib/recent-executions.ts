/**
 * "Últimas execuções" do /painel — contrato REAL, workspace-scoped.
 *
 * FONTE (e só ela): occurrences de ROTINAS AGENDADAS realmente concluídas
 *   completed_at IS NOT NULL AND response_id IS NOT NULL
 * vindo da RPC `list_workspace_recent_checklist_executions` (6B.2E). Ocorrência
 * pendente/futura/aberta em atraso pertence a "Rotinas agendadas" ou "Pontos de
 * atenção"; resposta avulsa/pública NÃO entra aqui — `visitor_id` não é
 * identidade de perfil e nunca é tratado como membro.
 *
 * EXECUTOR: o membro ATRIBUÍDO da occurrence é o executor real. Isso não é
 * suposição: `checklist_occurrence_execution_context` (6B.2B) exige
 * `workspace_members.user_id = auth.uid()` do membro do schedule — com
 * membership ATIVA — para iniciar/concluir, e rejeita qualquer outro usuário
 * (inclusive gestor). A tabela não tem policy de escrita e o browser não recebe
 * UPDATE: não existe caminho em que atribuído != executor. O contrato mantém
 * "Responsável atribuído" e "Executado por" como campos SEPARADOS — hoje
 * resolvem para a mesma pessoa, mas o modelo não os funde.
 *
 * AVATAR: a preferência do membro viaja nas duas chaves necessárias
 * (`avatar_display_mode`, `illustrated_avatar_id`) extraídas do JSONB no banco —
 * `profiles.settings` inteiro nunca sai do servidor. Quem decide a aparência
 * final é o MemberAvatar (foto → escolhido → automático → iniciais).
 *
 * Este módulo é PURO (sem cliente, sem React): rede vive no hook
 * `useRecentChecklistExecutions`.
 */
import { format, isSameDay, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

import type { ExecutionStatusTone, RecentExecution } from "@/components/dashboard/real/RealRecentExecutions";
import { MEMBER_NAME_FALLBACK } from "./member-identity";
import { isIllustratedAvatarId } from "./member-avatars";
import { isAvatarDisplayMode, type AvatarDisplayMode } from "./member-avatar-preference";
import {
  deriveOccurrenceDashboardStatus,
  formatOccurrenceDashboardStatus,
  OCCURRENCE_FALLBACK_TITLE,
  type OccurrenceDashboardStatus,
} from "./occurrence-dashboard";

/** Quantas execuções o card precisa (o RPC é capado em 20). */
export const RECENT_EXECUTION_DEFAULT_LIMIT = 6;
export const RECENT_EXECUTION_MAX_LIMIT = 20;

/** Raw row of public.list_workspace_recent_checklist_executions. */
export type RecentChecklistExecutionRow = {
  occurrence_id?: string | null;
  checklist_id?: string | null;
  checklist_title?: string | null;
  response_id?: string | null;
  occurrence_date?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  unit_id?: string | null;
  unit_name?: string | null;
  shift_id?: string | null;
  shift_name?: string | null;
  workspace_member_id?: string | null;
  user_id?: string | null;
  responsible_name?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  avatar_display_mode?: string | null;
  illustrated_avatar_id?: string | null;
};

/**
 * Contrato local e estreito do cliente para a RPC 6B.2E. `supabase/types.ts`
 * continua intocado (mesma fronteira de 5E.2A/6B.2B/6B.2D): o cast acontece uma
 * única vez, no hook.
 */
export interface RecentExecutionsDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      list_workspace_recent_checklist_executions: {
        Args: {
          p_workspace_id: string;
          p_start_date: string;
          p_end_date: string;
          p_unit_id?: string | null;
          p_shift_id?: string | null;
          p_limit?: number | null;
        };
        Returns: RecentChecklistExecutionRow[];
      };
    };
  };
}

/** Uma execução concluída de rotina, já validada (sem campo inventado). */
export type RecentChecklistExecution = {
  occurrenceId: string;
  checklistId: string;
  checklistTitle: string;
  responseId: string;
  /** Data civil da obrigação (YYYY-MM-DD) — a mesma chave do recorte. */
  occurrenceDate: string;
  dueAt: string;
  completedAt: string;
  unitId: string | null;
  unitName: string | null;
  shiftId: string | null;
  shiftName: string | null;
  /** Membro atribuído — identidade do executor real (ver cabeçalho). */
  workspaceMemberId: string | null;
  userId: string | null;
  responsibleName: string;
  role: string | null;
  avatarUrl: string | null;
  /** Preferência validada; valor desconhecido vira null (o MemberAvatar decide). */
  avatarDisplayMode: AvatarDisplayMode | null;
  illustratedAvatarId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asUuid(value: unknown): string | null {
  const s = asString(value);
  return s && UUID_RE.test(s) ? s : null;
}

function asIsoInstant(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

function asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s || !ISO_DATE_RE.test(s)) return null;
  return s;
}

/**
 * Parse fail-closed do payload da RPC.
 *
 * Obrigatórios: identidade da occurrence, do checklist, da RESPOSTA, a data
 * civil da obrigação, o prazo e a conclusão. A RPC filtra
 * `completed_at IS NOT NULL AND response_id IS NOT NULL`; a linha que chegar sem
 * eles é violação de contrato e é DESCARTADA em vez de renderizada com um
 * lifecycle inventado (nunca aparece execução sem conclusão nem execução sem
 * resposta vinculada).
 *
 * Opcionais: unidade, turno, identidade do membro, foto e preferência de avatar —
 * uma rotina sem unidade/turno é válida e não pode derrubar a linha.
 */
export function parseRecentChecklistExecutions(raw: unknown): RecentChecklistExecution[] {
  if (!Array.isArray(raw)) return [];

  const out: RecentChecklistExecution[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const occurrenceId = asUuid(row.occurrence_id);
    const checklistId = asUuid(row.checklist_id);
    const responseId = asUuid(row.response_id);
    const occurrenceDate = asIsoDate(row.occurrence_date);
    const dueAt = asIsoInstant(row.due_at);
    const completedAt = asIsoInstant(row.completed_at);
    if (!occurrenceId || !checklistId || !responseId || !occurrenceDate || !dueAt || !completedAt) {
      continue;
    }

    const displayMode = asString(row.avatar_display_mode);
    const illustratedId = asString(row.illustrated_avatar_id);

    out.push({
      occurrenceId,
      checklistId,
      checklistTitle: asString(row.checklist_title) ?? OCCURRENCE_FALLBACK_TITLE,
      responseId,
      occurrenceDate,
      dueAt,
      completedAt,
      unitId: asUuid(row.unit_id),
      unitName: asString(row.unit_name),
      shiftId: asUuid(row.shift_id),
      shiftName: asString(row.shift_name),
      workspaceMemberId: asUuid(row.workspace_member_id),
      userId: asUuid(row.user_id),
      responsibleName: asString(row.responsible_name) ?? MEMBER_NAME_FALLBACK,
      role: asString(row.role),
      avatarUrl: asString(row.avatar_url),
      // Validação do lado do cliente: o banco devolve a preferência crua, quem
      // conhece o domínio é o módulo de preferência/registry.
      avatarDisplayMode: isAvatarDisplayMode(displayMode) ? displayMode : null,
      illustratedAvatarId: isIllustratedAvatarId(illustratedId) ? illustratedId : null,
    });
  }
  return out;
}

/**
 * Ordem canônica do card: mais recente primeiro, com desempate determinístico
 * pelo id da occurrence (o backend já ordena; o cliente reafirma para não
 * depender da ordem de chegada do payload).
 */
export function sortRecentExecutionsByCompletedDesc(
  executions: RecentChecklistExecution[],
): RecentChecklistExecution[] {
  return [...executions].sort((a, b) => {
    if (a.completedAt !== b.completedAt) return a.completedAt < b.completedAt ? 1 : -1;
    if (a.occurrenceId !== b.occurrenceId) return a.occurrenceId < b.occurrenceId ? 1 : -1;
    return 0;
  });
}

/**
 * Rótulo humano do papel no workspace. Vocabulário já usado pelo produto
 * (Configurações → Minha conta, equipe). NÃO é cargo: o schema não tem job title,
 * e papel desconhecido devolve null para que a linha simplesmente não apareça.
 */
export function roleLabelFromRole(role: string | null | undefined): string | null {
  switch (role) {
    case "owner":
      return "Proprietário";
    case "admin":
      return "Administrador";
    case "editor":
      return "Editor";
    case "viewer":
      return "Visualizador";
    default:
      return null;
  }
}

/** Instante → rótulo de hora no mesmo padrão das superfícies de rotina do produto. */
function instantLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Segunda linha de destaque: quando aconteceu, em linguagem curta e estável
 * ("agora", "há 12 min", "há 3 h", "ontem", "há 5 dias"). Determinística (sem
 * Intl de distância) para poder ser testada.
 */
export function formatExecutionRelative(iso: string, now: Date = new Date()): string {
  const completed = new Date(iso);
  if (Number.isNaN(completed.getTime())) return "";

  const diffMs = now.getTime() - completed.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

/** Linha pequena à direita: "hoje · 08:12", "ontem · 22:41" ou "15/09 · 22:07". */
export function formatExecutionOccurredAt(iso: string, now: Date = new Date()): string {
  const completed = new Date(iso);
  if (Number.isNaN(completed.getTime())) return "";
  const time = instantLabel(iso);
  if (isSameDay(completed, now)) return `hoje · ${time}`;
  if (isYesterday(completed)) return `ontem · ${time}`;
  return `${format(completed, "dd/MM", { locale: ptBR })} · ${time}`;
}

/** Tom do selo. O card só lista execuções CONCLUÍDAS: atraso concluído é o único
 * caso de exceção possível aqui — e é a mesma leitura do domínio
 * (`occurrenceStatusBadgeVariant`: prazo → success, atraso → error). */
export function executionStatusTone(status: OccurrenceDashboardStatus): ExecutionStatusTone {
  return status === "concluida_com_atraso" ? "failed" : "done";
}

/** Linha secundária do card: o recorte real da execução (unidade · turno). */
function executionContext(execution: RecentChecklistExecution): string {
  const parts = [execution.unitName, execution.shiftName].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : "Sem unidade vinculada";
}

/**
 * Tradução do contrato validado para o contrato de APRESENTAÇÃO do card.
 *
 * Nada é preenchido por enfeite: `resultLabel`/`compliancePercentage` não são
 * emitidos porque a occurrence não possui esse contrato — o drawer já sabe
 * omitir campos ausentes.
 */
export function buildRecentExecutions(
  executions: RecentChecklistExecution[],
  now: Date = new Date(),
): RecentExecution[] {
  return sortRecentExecutionsByCompletedDesc(executions).map((execution) => {
    const status = deriveOccurrenceDashboardStatus(
      { startedAt: null, completedAt: execution.completedAt, dueAt: execution.dueAt },
      now,
    );

    return {
      // Id da LINHA é a occurrence — nunca o id do checklist (que só habilita
      // "Ver Checklist").
      id: execution.occurrenceId,
      checklist: execution.checklistTitle,
      executor: execution.responsibleName,
      memberId: execution.workspaceMemberId ?? undefined,
      context: executionContext(execution),
      statusLabel: formatOccurrenceDashboardStatus(status),
      statusTone: executionStatusTone(status),
      occurredAt: formatExecutionOccurredAt(execution.completedAt, now),
      relative: formatExecutionRelative(execution.completedAt, now),

      // Identidade confiável (ver cabeçalho): atribuído = executor da occurrence.
      executorIdentified: true,
      executorName: execution.responsibleName,
      assignedName: execution.responsibleName,
      assignedMemberId: execution.workspaceMemberId ?? undefined,
      roleLabel: roleLabelFromRole(execution.role) ?? undefined,

      checklistId: execution.checklistId,
      occurrenceId: execution.occurrenceId,
      responseId: execution.responseId,

      unitId: execution.unitId ?? undefined,
      unitName: execution.unitName ?? undefined,
      shiftId: execution.shiftId ?? undefined,
      shiftName: execution.shiftName ?? undefined,
      dueAt: execution.dueAt,
      completedAt: execution.completedAt,

      // Foto + preferência REAL do membro (a escolha ilustrada não fica escondida
      // atrás da foto: quem decide é o MemberAvatar).
      avatarUrl: execution.avatarUrl ?? undefined,
      avatarDisplayMode: execution.avatarDisplayMode,
      selectedAvatarId: execution.illustratedAvatarId,
    };
  });
}
