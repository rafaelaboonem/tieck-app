/**
 * Execution 5E.2C.2 — "Rotinas de execução" settings panel.
 *
 * Lists/creates/edits/ends recurring schedules through the audited 5E.2C.1
 * RPCs ONLY (via lib/execution-schedule-management). Never deletes, never
 * touches occurrences, never calls the materializer, never reuses the legacy
 * Alertas de Prazo (checklist_assignments) flow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createChecklistExecutionSchedule,
  deactivateChecklistExecutionSchedule,
  formatScheduleEndsOn,
  formatScheduleFrequency,
  FREQUENCY_LABELS,
  getBrowserTimezone,
  getScheduleErrorMessage,
  ISO_WEEKDAY_LABELS,
  isValidScheduleDate,
  listChecklistExecutionSchedules,
  SCHEDULE_ERROR_MESSAGES,
  normalizeScheduleTime,
  normalizeScheduleWeekdays,
  updateChecklistExecutionSchedule,
  validateScheduleDraft,
} from "@/lib/execution-schedule-management";
import {
  EXECUTION_SCHEDULE_FREQUENCIES,
  ISO_WEEKDAYS,
  type ExecutionSchedule,
  type ExecutionScheduleFrequency,
} from "@/lib/execution-schedule";
import { getWorkspaceMemberLabel, type WorkspaceMemberLike } from "@/lib/assignment-deadline-ui";

export interface ScheduleSettingsMember extends WorkspaceMemberLike {
  id: string;
}

export interface ExecutionScheduleSettingsProps {
  checklistId: string | null;
  canManage: boolean;
  workspaceMembers: ScheduleSettingsMember[];
}

type PanelMode = "closed" | "create" | "edit";

interface ScheduleDraftState {
  workspaceMemberId: string;
  frequency: ExecutionScheduleFrequency;
  weekdays: number[];
  dueLocalTime: string;
  timezone: string;
  startsOn: string;
  endsOn: string;
}

/** Local-date YYYY-MM-DD of "now" — a civil date, never a UTC conversion. */
function getLocalToday(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function createEmptyDraft(today: string, browserTimezone: string): ScheduleDraftState {
  return {
    workspaceMemberId: "",
    frequency: "daily",
    weekdays: [],
    dueLocalTime: "18:00",
    timezone: browserTimezone,
    startsOn: today,
    endsOn: "",
  };
}

function draftFromSchedule(schedule: ExecutionSchedule): ScheduleDraftState {
  return {
    workspaceMemberId: schedule.workspace_member_id,
    frequency: schedule.frequency,
    weekdays: schedule.weekdays ? [...schedule.weekdays] : [],
    dueLocalTime: schedule.due_local_time,
    timezone: schedule.timezone,
    startsOn: schedule.starts_on,
    // 5E.2C.2.1 §4D: a once rotina ALWAYS hydrates with an empty end date.
    endsOn: schedule.frequency === "once" ? "" : schedule.ends_on ?? "",
  };
}

export function ExecutionScheduleSettings({
  checklistId,
  canManage,
  workspaceMembers,
}: ExecutionScheduleSettingsProps) {
  const [schedules, setSchedules] = useState<ExecutionSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("closed");
  const [editingSchedule, setEditingSchedule] = useState<ExecutionSchedule | null>(null);
  const [draft, setDraft] = useState<ScheduleDraftState>(() =>
    createEmptyDraft(getLocalToday(), getBrowserTimezone())
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [deactivatingSchedule, setDeactivatingSchedule] = useState<ExecutionSchedule | null>(null);
  // Guards against double-click / concurrent second calls (§12).
  const mutationInFlightRef = useRef(false);

  const browserTimezones = useMemo(() => {
    try {
      const intl = Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] };
      if (typeof intl.supportedValuesOf === "function") {
        const values = intl.supportedValuesOf("timeZone");
        if (Array.isArray(values)) return values;
      }
    } catch {
      // Older engines: empty suggestions, free-form input still works.
    }
    return [];
  }, []);

  const activeSchedules = useMemo(
    () => (Array.isArray(schedules) ? schedules.filter((s) => s.is_active) : []),
    [schedules]
  );
  const endedSchedules = useMemo(
    () => (Array.isArray(schedules) ? schedules.filter((s) => !s.is_active) : []),
    [schedules]
  );

  // 5E.2C.2.1 §5: request sequencing — a response that resolves after the
  // checklist or the permission changed must never repopulate stale data.
  const loadSequenceRef = useRef(0);

  const reloadSchedules = useCallback(async () => {
    // Fail-closed: BOTH a persisted checklist AND management permission are
    // required. Without permission: no SELECT/RPC, no stale data, no panel.
    if (!checklistId || !canManage) {
      loadSequenceRef.current += 1; // invalidate any in-flight read
      setSchedules([]);
      setLoadError(null);
      setIsLoading(false);
      setPanelMode("closed");
      setEditingSchedule(null);
      setDeactivatingSchedule(null);
      return;
    }
    const sequence = ++loadSequenceRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const rows = await listChecklistExecutionSchedules(checklistId);
      if (sequence !== loadSequenceRef.current) return; // stale response
      setSchedules(rows);
    } catch (error) {
      console.error("[ExecutionScheduleSettings] list failed:", error);
      if (sequence !== loadSequenceRef.current) return; // stale error
      setLoadError(getScheduleErrorMessage(error));
    } finally {
      // Only the current request may end the loading state.
      if (sequence === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [checklistId, canManage]);

  useEffect(() => {
    void reloadSchedules();
  }, [reloadSchedules]);

  // A checklist without a persisted id cannot hold schedules — clear any
  // panel state (§13: "Salve o checklist antes de criar uma rotina.").
  useEffect(() => {
    if (!checklistId) {
      setPanelMode("closed");
      setEditingSchedule(null);
      setFormError(null);
    }
  }, [checklistId]);

  const memberLabelById = useMemo(() => {
    const map = new Map<string, string>();
    workspaceMembers.forEach((m) => map.set(m.id, getWorkspaceMemberLabel(m)));
    return map;
  }, [workspaceMembers]);

  const scheduleMemberLabel = useCallback(
    (schedule: ExecutionSchedule): string =>
      memberLabelById.get(schedule.workspace_member_id) ?? "Membro removido",
    [memberLabelById]
  );

  const openCreate = () => {
    if (!canManage || !checklistId) return;
    setEditingSchedule(null);
    setFormError(null);
    setDraft(createEmptyDraft(getLocalToday(), getBrowserTimezone()));
    setPanelMode("create");
  };

  const openEdit = (schedule: ExecutionSchedule) => {
    if (!canManage || !schedule.is_active) return;
    setEditingSchedule(schedule);
    setFormError(null);
    setDraft(draftFromSchedule(schedule));
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode("closed");
    setEditingSchedule(null);
    setFormError(null);
  };

  const payloadFromDraft = () => ({
    frequency: draft.frequency,
    weekdays: normalizeScheduleWeekdays(draft.frequency, draft.weekdays),
    dueLocalTime: normalizeScheduleTime(draft.dueLocalTime) ?? draft.dueLocalTime,
    timezone: draft.timezone.trim(),
    startsOn: draft.startsOn,
    // 5E.2C.2.1 §4B: once NEVER carries an end date, regardless of stale state.
    endsOn: draft.frequency === "once" ? null : draft.endsOn || null,
  });

  const submitDraft = async () => {
    if (mutationInFlightRef.current || !canManage) return;
    if (!checklistId) {
      setFormError("Salve o checklist antes de criar uma rotina.");
      return;
    }
    const validationError = validateScheduleDraft(
      {
        workspaceMemberId: draft.workspaceMemberId || null,
        frequency: draft.frequency,
        weekdays: draft.weekdays,
        dueLocalTime: draft.dueLocalTime,
        timezone: draft.timezone,
        startsOn: draft.startsOn,
        // 5E.2C.2.1 §4C: validate against the EFFECTIVE end date — a once
        // rotina is never blocked by a stale endsOn.
        endsOn: draft.frequency === "once" ? null : draft.endsOn || null,
      },
      { requireMember: panelMode === "create" }
    );
    if (validationError) {
      setFormError(SCHEDULE_ERROR_MESSAGES[validationError]);
      return;
    }

    mutationInFlightRef.current = true;
    setIsMutating(true);
    setFormError(null);
    try {
      if (panelMode === "create" && draft.workspaceMemberId) {
        await createChecklistExecutionSchedule({
          checklistId,
          workspaceMemberId: draft.workspaceMemberId,
          ...payloadFromDraft(),
        });
        toast.success("Rotina criada");
      } else if (panelMode === "edit" && editingSchedule) {
        await updateChecklistExecutionSchedule(editingSchedule.id, payloadFromDraft());
        toast.success("Rotina atualizada");
      }
      closePanel();
      await reloadSchedules();
    } catch (error) {
      console.error("[ExecutionScheduleSettings] save failed:", error);
      setFormError(getScheduleErrorMessage(error));
    } finally {
      mutationInFlightRef.current = false;
      setIsMutating(false);
    }
  };

  const requestDeactivate = (schedule: ExecutionSchedule) => {
    if (!canManage || !schedule.is_active || mutationInFlightRef.current) return;
    setDeactivatingSchedule(schedule);
  };

  const confirmDeactivate = async () => {
    const target = deactivatingSchedule;
    if (!target || mutationInFlightRef.current || !canManage) return;
    mutationInFlightRef.current = true;
    setIsMutating(true);
    try {
      await deactivateChecklistExecutionSchedule(target.id);
      toast.success("Rotina encerrada");
      setDeactivatingSchedule(null);
      await reloadSchedules();
    } catch (error) {
      console.error("[ExecutionScheduleSettings] deactivate failed:", error);
      toast.error(getScheduleErrorMessage(error));
    } finally {
      mutationInFlightRef.current = false;
      setIsMutating(false);
    }
  };

  const toggleWeekday = (day: number) => {
    setDraft((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day],
    }));
  };

  const showNoMembersGuidance = canManage && workspaceMembers.length === 0;

  return (
    <section aria-label="Rotinas de execução" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Rotinas de execução</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Defina quem deve executar este checklist e em quais dias e horários.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            disabled={!checklistId || isMutating}
            data-testid="execution-schedule-new"
            className="shrink-0 text-xs font-bold bg-[#FF007F] text-white rounded-md px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Nova rotina
          </button>
        )}
      </div>

      {!checklistId && (
        <p className="mt-4 text-xs text-neutral-500" data-testid="execution-schedule-unsaved">
          Salve o checklist antes de criar uma rotina.
        </p>
      )}

      {showNoMembersGuidance && (
        <p className="mt-4 text-xs text-neutral-500" data-testid="execution-schedule-no-members">
          Adicione um integrante à equipe para atribuir a execução da rotina.
        </p>
      )}

      {!canManage && (
        <p className="mt-4 text-xs text-neutral-500" data-testid="execution-schedule-readonly">
          Você não tem permissão para gerenciar rotinas.
        </p>
      )}

      {isLoading && (
        <p className="mt-6 text-xs text-neutral-400" data-testid="execution-schedule-loading">
          Carregando rotinas…
        </p>
      )}

      {!isLoading && loadError && (
        <div className="mt-6" data-testid="execution-schedule-error">
          <p className="text-xs text-red-600">{loadError}</p>
          <button
            type="button"
            onClick={() => void reloadSchedules()}
            className="mt-2 text-xs font-semibold text-neutral-700 border border-neutral-200 rounded-md px-3 py-1.5 hover:bg-neutral-50"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !loadError && checklistId && schedules.length === 0 && (
        <p className="mt-6 text-xs text-neutral-500" data-testid="execution-schedule-empty">
          Nenhuma rotina criada ainda.
        </p>
      )}

      {activeSchedules.length > 0 && (
        <div className="mt-6 space-y-3" data-testid="execution-schedule-active-list">
          {activeSchedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              memberLabel={scheduleMemberLabel(schedule)}
              canManage={canManage}
              isMutating={isMutating}
              onEdit={openEdit}
              onDeactivate={requestDeactivate}
            />
          ))}
        </div>
      )}

      {endedSchedules.length > 0 && (
        <div className="mt-8" data-testid="execution-schedule-ended-section">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-3">
            Rotinas encerradas
          </h3>
          <div className="space-y-3">
            {endedSchedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                memberLabel={scheduleMemberLabel(schedule)}
                canManage={canManage}
                isMutating={isMutating}
                onEdit={openEdit}
                onDeactivate={requestDeactivate}
              />
            ))}
          </div>
        </div>
      )}

      {panelMode !== "closed" && (
        <div className="mt-6 border border-neutral-200 rounded-lg p-4" data-testid="execution-schedule-form">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">
            {panelMode === "create" ? "Nova rotina" : "Editar rotina"}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1" htmlFor="schedule-member">
                Responsável
              </label>
              {panelMode === "create" ? (
                <select
                  id="schedule-member"
                  value={draft.workspaceMemberId}
                  onChange={(e) => setDraft((prev) => ({ ...prev, workspaceMemberId: e.target.value }))}
                  disabled={!canManage || isMutating}
                  data-testid="execution-schedule-member"
                  className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 bg-white outline-none focus:border-neutral-400"
                >
                  <option value="">Selecionar responsável</option>
                  {workspaceMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {getWorkspaceMemberLabel(m)}
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <input
                    id="schedule-member"
                    value={scheduleMemberLabel(editingSchedule!)}
                    readOnly
                    disabled
                    data-testid="execution-schedule-member-locked"
                    className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 bg-neutral-50 text-neutral-500"
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Para trocar o responsável, encerre esta rotina e crie uma nova.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1" htmlFor="schedule-frequency">
                Frequência
              </label>
              <select
                id="schedule-frequency"
                value={draft.frequency}
                onChange={(e) =>
                  setDraft((prev) => {
                    const frequency = e.target.value as ExecutionScheduleFrequency;
                    // 5E.2C.2.1 §4A: switching to once clears any stale end
                    // date immediately; every other field stays intact.
                    return { ...prev, frequency, endsOn: frequency === "once" ? "" : prev.endsOn };
                  })
                }
                disabled={!canManage || isMutating}
                data-testid="execution-schedule-frequency"
                className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 bg-white outline-none focus:border-neutral-400"
              >
                {EXECUTION_SCHEDULE_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            {draft.frequency === "specific_weekdays" && (
              <div data-testid="execution-schedule-weekdays">
                <span className="block text-xs font-medium text-neutral-700 mb-1">Dias da semana</span>
                <div className="flex flex-wrap gap-1.5">
                  {ISO_WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      disabled={!canManage || isMutating}
                      aria-pressed={draft.weekdays.includes(day)}
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                        draft.weekdays.includes(day)
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      {ISO_WEEKDAY_LABELS[day]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1" htmlFor="schedule-time">
                  Horário local
                </label>
                <input
                  id="schedule-time"
                  type="text"
                  inputMode="numeric"
                  placeholder="18:00"
                  maxLength={5}
                  value={draft.dueLocalTime}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, dueLocalTime: formatTimeInput(e.target.value) }))
                  }
                  disabled={!canManage || isMutating}
                  data-testid="execution-schedule-time"
                  className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1" htmlFor="schedule-timezone">
                  Fuso horário
                </label>
                <input
                  id="schedule-timezone"
                  type="text"
                  list="schedule-timezone-options"
                  value={draft.timezone}
                  onChange={(e) => setDraft((prev) => ({ ...prev, timezone: e.target.value }))}
                  disabled={!canManage || isMutating}
                  data-testid="execution-schedule-timezone"
                  className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400"
                />
                <datalist id="schedule-timezone-options">
                  {browserTimezones.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1" htmlFor="schedule-starts-on">
                  Data inicial
                </label>
                <input
                  id="schedule-starts-on"
                  type="date"
                  value={draft.startsOn}
                  onChange={(e) => setDraft((prev) => ({ ...prev, startsOn: e.target.value }))}
                  disabled={!canManage || isMutating}
                  data-testid="execution-schedule-starts-on"
                  className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1" htmlFor="schedule-ends-on">
                  Data final (opcional)
                </label>
                <input
                  id="schedule-ends-on"
                  type="date"
                  value={draft.endsOn}
                  min={draft.startsOn || undefined}
                  disabled={!canManage || isMutating || draft.frequency === "once"}
                  onChange={(e) => setDraft((prev) => ({ ...prev, endsOn: e.target.value }))}
                  data-testid="execution-schedule-ends-on"
                  className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 outline-none focus:border-neutral-400"
                />
              </div>
            </div>

            {formError && (
              <p className="text-xs text-red-600" data-testid="execution-schedule-form-error" role="alert">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => void submitDraft()}
                disabled={!canManage || isMutating}
                data-testid="execution-schedule-submit"
                className="text-xs font-bold bg-[#FF007F] text-white rounded-md px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {panelMode === "create" ? "Criar rotina" : "Salvar alterações"}
              </button>
              <button
                type="button"
                onClick={closePanel}
                disabled={isMutating}
                data-testid="execution-schedule-cancel"
                className="text-xs font-semibold text-neutral-700 border border-neutral-200 rounded-md px-4 py-2 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={deactivatingSchedule !== null}
        onOpenChange={(open) => {
          if (!open && !isMutating) setDeactivatingSchedule(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar esta rotina?</AlertDialogTitle>
            <AlertDialogDescription>
              Novas execuções deixarão de ser programadas. O histórico já existente será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDeactivate();
              }}
              disabled={isMutating}
              data-testid="execution-schedule-confirm-deactivate"
            >
              Encerrar rotina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Digits-only typing aid: "1337" → "13:37" (same semantics as 5E.1.1). */
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function ScheduleCard({
  schedule,
  memberLabel,
  canManage,
  isMutating,
  onEdit,
  onDeactivate,
}: {
  schedule: ExecutionSchedule;
  memberLabel: string;
  canManage: boolean;
  isMutating: boolean;
  onEdit: (schedule: ExecutionSchedule) => void;
  onDeactivate: (schedule: ExecutionSchedule) => void;
}) {
  return (
    <div
      className="border border-neutral-200 rounded-lg p-4"
      data-testid="execution-schedule-card"
      data-schedule-id={schedule.id}
      data-schedule-active={schedule.is_active ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 truncate">{memberLabel}</p>
          <p className="mt-0.5 text-xs text-neutral-600">
            {formatScheduleFrequency(schedule)} · {schedule.due_local_time} ({schedule.timezone})
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Início {isValidScheduleDate(schedule.starts_on) ? schedule.starts_on : "—"} ·{" "}
            {formatScheduleEndsOn(schedule.ends_on)}
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            schedule.is_active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
          }`}
          data-testid="execution-schedule-badge"
        >
          {schedule.is_active ? "Ativa" : "Encerrada"}
        </span>
      </div>
      {canManage && schedule.is_active && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(schedule)}
            disabled={isMutating}
            data-testid="execution-schedule-edit"
            className="text-xs font-semibold text-neutral-700 border border-neutral-200 rounded-md px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => onDeactivate(schedule)}
            disabled={isMutating}
            data-testid="execution-schedule-deactivate"
            className="text-xs font-semibold text-red-600 border border-red-200 rounded-md px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Encerrar rotina
          </button>
        </div>
      )}
    </div>
  );
}
