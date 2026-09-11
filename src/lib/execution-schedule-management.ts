/**
 * Execution 5E.2C.2 — typed client surface for schedule management.
 *
 * Reads checklist_execution_schedules via SELECT only; ALL writes go through
 * the audited 5E.2C.1 RPCs:
 *   - create_checklist_execution_schedule
 *   - update_checklist_execution_schedule
 *   - deactivate_checklist_execution_schedule
 *
 * supabase/types.ts is intentionally NOT edited here (per 5E.2A contract) —
 * this module carries a local, narrow ScheduleDatabase contract and casts the
 * client exactly once at the boundary. No direct INSERT/UPDATE/DELETE, no
 * occurrences surface, no materializer call.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXECUTION_SCHEDULE_FREQUENCIES,
  type ExecutionSchedule,
  type ExecutionScheduleFrequency,
  type IsoWeekday,
} from "@/lib/execution-schedule";

// ─────────────────────────────────────────────────────────────────────────────
// Local narrow DB contract (types.ts untouched)
// ─────────────────────────────────────────────────────────────────────────────

/** Row shape compatible with public.checklist_execution_schedules (5E.2A). */
export type ExecutionScheduleRow = ExecutionSchedule & { [key: string]: unknown };

export interface ScheduleDatabase {
  public: {
    Tables: {
      checklist_execution_schedules: {
        Row: ExecutionScheduleRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_checklist_execution_schedule: {
        Args: {
          p_checklist_id: string;
          p_workspace_member_id: string;
          p_frequency: string;
          p_weekdays: number[] | null;
          p_due_local_time: string;
          p_timezone: string;
          p_starts_on: string;
          p_ends_on: string | null;
        };
        Returns: string;
      };
      update_checklist_execution_schedule: {
        Args: {
          p_schedule_id: string;
          p_frequency: string;
          p_weekdays: number[] | null;
          p_due_local_time: string;
          p_timezone: string;
          p_starts_on: string;
          p_ends_on: string | null;
        };
        Returns: boolean;
      };
      deactivate_checklist_execution_schedule: {
        Args: { p_schedule_id: string };
        Returns: boolean;
      };
    };
  };
}

/** Single, explicit boundary cast (§5) — never inside components. */
const scheduleClient = supabase as unknown as SupabaseClient<ScheduleDatabase>;

// ─────────────────────────────────────────────────────────────────────────────
// Reads (SELECT only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists the checklist's schedules via SELECT, ordered: active first, each
 * group newest-first (created_at DESC).
 */
export async function listChecklistExecutionSchedules(
  checklistId: string
): Promise<ExecutionScheduleRow[]> {
  const { data, error } = await scheduleClient
    .from("checklist_execution_schedules")
    .select("*")
    .eq("checklist_id", checklistId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes — exclusively through the audited 5E.2C.1 RPCs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateScheduleInput {
  checklistId: string;
  workspaceMemberId: string;
  frequency: ExecutionScheduleFrequency;
  weekdays: number[] | null;
  dueLocalTime: string;
  timezone: string;
  startsOn: string;
  endsOn: string | null;
}

/** Creates a rotina via the audited RPC. Returns the new schedule UUID. */
export async function createChecklistExecutionSchedule(
  input: CreateScheduleInput
): Promise<string> {
  const { data, error } = await scheduleClient.rpc(
    "create_checklist_execution_schedule",
    {
      p_checklist_id: input.checklistId,
      p_workspace_member_id: input.workspaceMemberId,
      p_frequency: input.frequency,
      p_weekdays: input.weekdays,
      p_due_local_time: input.dueLocalTime,
      p_timezone: input.timezone,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
    }
  );
  if (error) throw error;
  return data;
}

export interface UpdateScheduleInput {
  frequency: ExecutionScheduleFrequency;
  weekdays: number[] | null;
  dueLocalTime: string;
  timezone: string;
  startsOn: string;
  endsOn: string | null;
}

/**
 * Updates ONLY the business config of an ACTIVE schedule via the audited RPC.
 * Never sends workspace_member_id / checklist_id / is_active (the 5E.2C.1
 * contract keeps those out of the RPC Args entirely).
 */
export async function updateChecklistExecutionSchedule(
  scheduleId: string,
  input: UpdateScheduleInput
): Promise<boolean> {
  const { data, error } = await scheduleClient.rpc(
    "update_checklist_execution_schedule",
    {
      p_schedule_id: scheduleId,
      p_frequency: input.frequency,
      p_weekdays: input.weekdays,
      p_due_local_time: input.dueLocalTime,
      p_timezone: input.timezone,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
    }
  );
  if (error) throw error;
  return data;
}

/** Deactivates (never deletes) a rotina via the audited RPC. Idempotent. */
export async function deactivateChecklistExecutionSchedule(
  scheduleId: string
): Promise<boolean> {
  const { data, error } = await scheduleClient.rpc(
    "deactivate_checklist_execution_schedule",
    { p_schedule_id: scheduleId }
  );
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation (pure, pre-RPC) — mirrors the DB constraints
// ─────────────────────────────────────────────────────────────────────────────

/** Civil date in YYYY-MM-DD format (no timezone math anywhere). */
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Timezone-safe local validation: real calendar date (2026-02-30 fails),
 * components re-checked through local Date getters — never a UTC round-trip.
 */
export function isValidScheduleDate(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !YYYY_MM_DD.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  return (
    probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
  );
}

/** Civil date comparison on YYYY-MM-DD strings — never a UTC conversion. */
export function scheduleEndsOnOrAfterStartsOn(
  startsOn: string,
  endsOn: string | null | undefined
): boolean {
  if (endsOn == null) return true;
  return (
    YYYY_MM_DD.test(startsOn) &&
    YYYY_MM_DD.test(endsOn) &&
    endsOn >= startsOn
  );
}

export type ScheduleDraft = {
  workspaceMemberId: string | null;
  frequency: ExecutionScheduleFrequency;
  weekdays: number[];
  dueLocalTime: string;
  timezone: string;
  startsOn: string;
  /** Empty string / null = rotina sem data final. */
  endsOn: string | null;
};

export interface ValidateScheduleDraftOptions {
  /** Creation requires an explicit responsible; edit keeps the existing one. */
  requireMember: boolean;
}

/**
 * Pre-RPC validation (§7). Returns a short stable key from
 * SCHEDULE_ERROR_MESSAGES so callers show the same friendly copy as RPC
 * failures. Null when the draft is valid.
 */
export function validateScheduleDraft(
  draft: ScheduleDraft,
  options: ValidateScheduleDraftOptions
): keyof typeof SCHEDULE_ERROR_MESSAGES | null {
  if (options.requireMember && !draft.workspaceMemberId) {
    return "schedule_member_required";
  }
  if (!EXECUTION_SCHEDULE_FREQUENCIES.includes(draft.frequency)) {
    return "unknown";
  }
  if (normalizeScheduleTime(draft.dueLocalTime) === null) {
    return "schedule_time_invalid";
  }
  if (!draft.timezone.trim()) {
    return "schedule_timezone_required";
  }
  if (!isValidScheduleDate(draft.startsOn)) {
    return "schedule_date_invalid";
  }
  if (draft.endsOn && !isValidScheduleDate(draft.endsOn)) {
    return "schedule_date_invalid";
  }
  if (draft.frequency === "once" && draft.endsOn) {
    return "schedule_once_ends_on";
  }
  if (!scheduleEndsOnOrAfterStartsOn(draft.startsOn, draft.endsOn || null)) {
    return "schedule_ends_on_before_start";
  }
  if (draft.frequency === "specific_weekdays") {
    const normalized = normalizeScheduleWeekdays("specific_weekdays", draft.weekdays);
    if (!normalized || normalized.length < 1) {
      return "schedule_weekdays_required";
    }
  }
  return null;
}

/** Strict HH:mm between 00:00 and 23:59 (uses the 5E.1.1 semantics). */
export function normalizeScheduleTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${m[1]}:${m[2]}`;
}

/**
 * Deduplicates + numerically sorts ISO weekdays; for frequencies other than
 * specific_weekdays the payload is null (DB CHECK contract).
 */
export function normalizeScheduleWeekdays(
  frequency: ExecutionScheduleFrequency,
  weekdays: number[] | null | undefined
): number[] | null {
  if (frequency !== "specific_weekdays") return null;
  if (!Array.isArray(weekdays)) return [];
  return Array.from(new Set(weekdays)).sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Friendly error mapping (§14) — DB codes never reach the UI raw
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULE_ERROR_MESSAGES = {
  schedule_actor_required: "Sua sessão expirou. Entre novamente.",
  schedule_checklist_required: "Este checklist não está disponível para rotinas.",
  schedule_checklist_not_found: "Este checklist não está disponível para rotinas.",
  schedule_member_required: "Selecione um responsável.",
  schedule_workspace_mismatch: "O responsável não pertence ao workspace deste checklist.",
  schedule_member_inactive: "Este responsável não está mais ativo na equipe.",
  schedule_timezone_required: "Selecione um fuso horário.",
  schedule_timezone_invalid: "Escolha um fuso horário válido.",
  schedule_management_denied: "Você não tem permissão para gerenciar rotinas.",
  schedule_required: "Esta rotina não foi encontrada.",
  schedule_not_found: "Esta rotina não foi encontrada.",
  schedule_inactive: "Esta rotina já foi encerrada.",
  schedule_member_required_form: "Selecione um responsável.",
  schedule_time_invalid: "Informe um horário entre 00:00 e 23:59.",
  schedule_date_invalid: "Informe uma data válida (AAAA-MM-DD).",
  schedule_once_ends_on: "Uma rotina de execução única não pode ter data final.",
  schedule_ends_on_before_start: "A data final não pode ser anterior à data inicial.",
  schedule_weekdays_required: "Selecione pelo menos um dia da semana.",
  unknown: "Não foi possível salvar a rotina. Tente novamente.",
} as const;

/** Extracts the stable DB error code from a PostgREST error, if present. */
export function getScheduleErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const maybe = error as { code?: unknown; message?: unknown };
  if (typeof maybe.code === "string" && maybe.code) return maybe.code;
  if (typeof maybe.message === "string" && maybe.message) {
    const match = /schedule_[a-z_]+/.exec(maybe.message);
    return match ? match[0] : null;
  }
  return null;
}

/** Friendly message for any known code; unknown errors keep the generic copy. */
export function getScheduleErrorMessage(error: unknown): string {
  const code = getScheduleErrorCode(error);
  if (!code) return SCHEDULE_ERROR_MESSAGES.unknown;
  return (
    (SCHEDULE_ERROR_MESSAGES as Record<string, string>)[code] ??
    SCHEDULE_ERROR_MESSAGES.unknown
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timezone helpers (§8) — browser truth, never a fixed default
// ─────────────────────────────────────────────────────────────────────────────

/** Browser-resolved IANA timezone; empty string when unavailable. */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** Typed, guarded wrapper around Intl.supportedValuesOf("timeZone"). */
export function getSupportedTimezones(): string[] {
  try {
    const intl = Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    if (typeof intl.supportedValuesOf === "function") {
      const values = intl.supportedValuesOf("timeZone");
      return Array.isArray(values) ? values : [];
    }
  } catch {
    // Older engines: fall through to the empty list (input stays free-form).
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Display helpers (§9 card + §7 labels)
// ─────────────────────────────────────────────────────────────────────────────

export const ISO_WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

export const FREQUENCY_LABELS: Record<ExecutionScheduleFrequency, string> = {
  once: "Uma vez",
  daily: "Todos os dias",
  weekly: "Semanalmente",
  specific_weekdays: "Dias específicos",
};

/** Human frequency text; appends the ISO weekday names when applicable. */
export function formatScheduleFrequency(schedule: {
  frequency: ExecutionScheduleFrequency;
  weekdays: number[] | null;
}): string {
  const base = FREQUENCY_LABELS[schedule.frequency];
  if (schedule.frequency === "specific_weekdays" && schedule.weekdays) {
    const names = schedule.weekdays
      .slice()
      .sort((a, b) => a - b)
      .map((w) => ISO_WEEKDAY_LABELS[w as IsoWeekday])
      .filter(Boolean)
      .join(", ");
    return names ? `${base}: ${names}` : base;
  }
  return base;
}

/** "Sem data final" when ends_on is absent. */
export function formatScheduleEndsOn(endsOn: string | null): string {
  return endsOn || "Sem data final";
}
