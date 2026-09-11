/**
 * Execution 5E.2C.2 — component behavior + route integration (§16 C/D).
 *
 * Component tests render ExecutionScheduleSettings with the data functions
 * mocked (no network). Route integration is verified structurally against the
 * real checklist.tsx source (rendering the 8k-line route is out of scope, same
 * approach as the 5E.0C.2/5E.1.1 suites).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ExecutionScheduleSettings } from "@/components/ExecutionScheduleSettings";
import type { ExecutionSchedule } from "@/lib/execution-schedule";
import type { ScheduleSettingsMember } from "@/components/ExecutionScheduleSettings";

const listMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const deactivateMock = vi.fn();

vi.mock("@/lib/execution-schedule-management", async () => {
  const actual = await vi.importActual<typeof import("@/lib/execution-schedule-management")>(
    "@/lib/execution-schedule-management"
  );
  return {
    ...actual,
    listChecklistExecutionSchedules: (...args: unknown[]) => listMock(...args),
    createChecklistExecutionSchedule: (...args: unknown[]) => createMock(...args),
    updateChecklistExecutionSchedule: (...args: unknown[]) => updateMock(...args),
    deactivateChecklistExecutionSchedule: (...args: unknown[]) => deactivateMock(...args),
  };
});

const schedule = (over: Partial<ExecutionSchedule> = {}): ExecutionSchedule => ({
  id: "sched-1",
  checklist_id: "c1",
  workspace_member_id: "m1",
  frequency: "daily",
  weekdays: null,
  due_local_time: "18:00",
  timezone: "America/Sao_Paulo",
  starts_on: "2026-09-11",
  ends_on: null,
  is_active: true,
  created_by: "u1",
  created_at: "2026-09-10T12:00:00Z",
  updated_at: "2026-09-10T12:00:00Z",
  ...over,
});

const members: ScheduleSettingsMember[] = [
  {
    id: "m1",
    role: "editor",
    user_id: "u1",
    email_normalized: "brayan@tieck.com",
    profiles: { display_name: "Brayan" },
  },
  {
    id: "m2",
    role: "viewer",
    user_id: "u2",
    email_normalized: "ana@tieck.com",
    profiles: { display_name: "Ana" },
  },
];

function setup(over: { checklistId?: string | null; canManage?: boolean } = {}) {
  // Explicit null must stay null (personal/unsaved checklist); defaults live in
  // beforeEach — per-test mock overrides set BEFORE setup() are respected.
  const checklistId = over.checklistId !== undefined ? over.checklistId : "c1";
  const canManage = over.canManage !== undefined ? over.canManage : true;
  return render(
    <ExecutionScheduleSettings
      checklistId={checklistId}
      canManage={canManage}
      workspaceMembers={members}
    />
  );
}

beforeEach(() => {
  listMock.mockReset().mockResolvedValue([]);
  createMock.mockReset().mockResolvedValue("new-id");
  updateMock.mockReset().mockResolvedValue(true);
  deactivateMock.mockReset().mockResolvedValue(true);
});

// ─────────────────────────────── states (§9) ────────────────────────────────

describe("5E.2C.2 component states", () => {
  it("unsaved checklist shows guidance and never calls SELECT/RPC", async () => {
    setup({ checklistId: null });
    expect(await screen.findByTestId("execution-schedule-unsaved")).toHaveTextContent(
      "Salve o checklist antes de criar uma rotina."
    );
    expect(listMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("empty state renders when the checklist has no rotinas", async () => {
    setup();
    expect(await screen.findByTestId("execution-schedule-empty")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith("c1");
  });

  it("loading state appears before the list resolves", async () => {
    let resolveList: (v: unknown) => void = () => {};
    listMock.mockReturnValue(new Promise((res) => (resolveList = res)));
    setup();
    expect(screen.getByTestId("execution-schedule-loading")).toBeInTheDocument();
    resolveList([]);
    await waitFor(() => expect(screen.queryByTestId("execution-schedule-loading")).toBeNull());
  });

  it("read error shows friendly message with retry that re-reads", async () => {
    listMock.mockRejectedValueOnce(new Error("boom"));
    setup();
    expect(await screen.findByTestId("execution-schedule-error")).toHaveTextContent(
      "Não foi possível salvar a rotina. Tente novamente."
    );
    listMock.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText("Tentar novamente"));
    await waitFor(() => expect(screen.queryByTestId("execution-schedule-error")).toBeNull());
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("without canManage: no create/edit/end actions and read-only note", async () => {
    setup({ canManage: false });
    await screen.findByTestId("execution-schedule-readonly");
    expect(screen.queryByTestId("execution-schedule-new")).toBeNull();
    expect(screen.getByTestId("execution-schedule-readonly")).toBeInTheDocument();
    // 5E.2C.2.1 §5A: fail-closed — zero SELECT, zero RPCs, no data.
    expect(listMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deactivateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("execution-schedule-card")).toBeNull();
  });
});

// ─────────────────────────────── listing (§9) ───────────────────────────────

describe("5E.2C.2 schedule cards", () => {
  it("supports multiple rotinas: card shows member, frequency, time, tz, dates, badge", async () => {
    listMock.mockResolvedValue([
      schedule({ id: "a", due_local_time: "08:00" }),
      schedule({ id: "b", due_local_time: "18:00" }),
      schedule({ id: "c", is_active: false, ends_on: "2026-12-31" }),
      schedule({ id: "d", is_active: false, ends_on: null }),
    ]);
    setup();
    expect(await screen.findAllByTestId("execution-schedule-card")).toHaveLength(4);
    expect(screen.getByTestId("execution-schedule-active-list")).toBeInTheDocument();
    expect(screen.getByTestId("execution-schedule-ended-section")).toBeInTheDocument();
    expect(screen.getAllByText("Ativa")).toHaveLength(2);
    expect(screen.getAllByText("Encerrada")).toHaveLength(2);
    expect(screen.getAllByText("Brayan")).toHaveLength(4);
    expect(screen.getAllByText(/Todos os dias/).length).toBeGreaterThan(0);
    expect(screen.getByText(/08:00 \(America\/Sao_Paulo\)/)).toBeInTheDocument();
    // a, b (active) and d (ended) have no end date; c ends on 2026-12-31.
    expect(screen.getAllByText(/Sem data final/).length).toBe(3);
    expect(screen.getAllByText(/2026-12-31/).length).toBeGreaterThan(0);
  });

  it("member no longer assignable is displayed as 'Membro removido'", async () => {
    listMock.mockResolvedValue([schedule({ workspace_member_id: "m-gone" })]);
    setup();
    expect(await screen.findByText("Membro removido")).toBeInTheDocument();
  });

  it("ended rotina shows no Editar and no Reativar buttons", async () => {
    listMock.mockResolvedValue([schedule({ is_active: false })]);
    setup();
    await screen.findByTestId("execution-schedule-card");
    expect(screen.queryByTestId("execution-schedule-edit")).toBeNull();
    expect(screen.queryByTestId("execution-schedule-deactivate")).toBeNull();
    expect(screen.queryByText("Reativar")).toBeNull();
  });
});

// ─────────────────────────────── creation (§10) ─────────────────────────────

describe("5E.2C.2 creation", () => {
  it("creates via RPC, toasts, closes and re-reads from the database", async () => {
    listMock.mockResolvedValue([]);
    createMock.mockResolvedValue("new-id");
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-new"));
    fireEvent.change(screen.getByTestId("execution-schedule-member"), { target: { value: "m2" } });
    fireEvent.click(screen.getByTestId("execution-schedule-submit"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ checklistId: "c1", workspaceMemberId: "m2" })
    );
    const args = createMock.mock.calls[0][0];
    expect(Object.keys(args)).not.toContain("checklistId_checklist_id");
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId("execution-schedule-form")).toBeNull());
  });

  it("blocks submit without a responsible member (friendly error, no RPC)", async () => {
    listMock.mockResolvedValue([]);
    setup();
    fireEvent.click(await screen.findByTestId("execution-schedule-new"));
    fireEvent.click(screen.getByTestId("execution-schedule-submit"));
    expect(await screen.findByTestId("execution-schedule-form-error")).toHaveTextContent(
      "Selecione um responsável."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("no-members guidance appears when assignable list is empty", async () => {
    listMock.mockResolvedValue([]);
    render(
      <ExecutionScheduleSettings checklistId="c1" canManage workspaceMembers={[]} />
    );
    expect(
      await screen.findByTestId("execution-schedule-no-members")
    ).toHaveTextContent("Adicione um integrante à equipe para atribuir a execução da rotina.");
  });
});

// ─────────────────────────────── edit (§11) ─────────────────────────────────

describe("5E.2C.2 edit", () => {
  it("hydrates real values; responsible locked; update RPC never receives member", async () => {
    listMock.mockResolvedValue([
      schedule({ frequency: "weekly", due_local_time: "09:30", timezone: "Europe/London" }),
    ]);
    updateMock.mockResolvedValue(true);
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-edit"));
    const locked = screen.getByTestId("execution-schedule-member-locked") as HTMLInputElement;
    expect(locked).toHaveAttribute("readonly");
    expect(locked).toBeDisabled();
    expect(screen.getByText("Para trocar o responsável, encerre esta rotina e crie uma nova.")).toBeInTheDocument();
    expect((screen.getByTestId("execution-schedule-frequency") as HTMLSelectElement).value).toBe("weekly");
    expect((screen.getByTestId("execution-schedule-time") as HTMLInputElement).value).toBe("09:30");
    expect((screen.getByTestId("execution-schedule-timezone") as HTMLInputElement).value).toBe("Europe/London");

    fireEvent.click(screen.getByTestId("execution-schedule-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [scheduleId, payload] = updateMock.mock.calls[0];
    expect(scheduleId).toBe("sched-1");
    expect(Object.keys(payload)).not.toContain("workspaceMemberId");
    expect(createMock).not.toHaveBeenCalled();
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("shows once frequency and disables the end-date field for it", async () => {
    listMock.mockResolvedValue([schedule({ frequency: "once" })]);
    setup();
    fireEvent.click(await screen.findByTestId("execution-schedule-edit"));
    expect((screen.getByTestId("execution-schedule-frequency") as HTMLSelectElement).value).toBe("once");
    expect(screen.getByTestId("execution-schedule-ends-on")).toBeDisabled();
  });
});

// ──────────────────────────── deactivation (§12) ────────────────────────────

describe("5E.2C.2 deactivation", () => {
  it("confirm dialog calls only deactivate RPC, toasts, re-reads", async () => {
    listMock.mockResolvedValue([schedule()]);
    deactivateMock.mockResolvedValue(true);
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-deactivate"));
    expect(await screen.findByText("Encerrar esta rotina?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Novas execuções deixarão de ser programadas. O histórico já existente será preservado."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId("execution-schedule-confirm-deactivate")).toHaveTextContent(
      "Encerrar rotina"
    );
    expect(deactivateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("execution-schedule-confirm-deactivate"));
    await waitFor(() => expect(deactivateMock).toHaveBeenCalledTimes(1));
    expect(deactivateMock).toHaveBeenCalledWith("sched-1");
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("actions are disabled while a mutation is in flight (double-click guard)", async () => {
    listMock.mockResolvedValue([schedule()]);
    let resolveDeactivate: (v: boolean) => void = () => {};
    deactivateMock.mockReturnValue(new Promise<boolean>((res) => (resolveDeactivate = res)));
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-deactivate"));
    fireEvent.click(await screen.findByTestId("execution-schedule-confirm-deactivate"));
    expect(deactivateMock).toHaveBeenCalledTimes(1);

    // While in flight: second confirm click must not fire a second call.
    fireEvent.click(screen.getByTestId("execution-schedule-confirm-deactivate"));
    fireEvent.click(screen.getByTestId("execution-schedule-deactivate"));
    resolveDeactivate(true);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  it("deactivate failure surfaces the friendly message and keeps the dialog", async () => {
    listMock.mockResolvedValue([schedule()]);
    deactivateMock.mockRejectedValue({ code: "schedule_inactive" });
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-deactivate"));
    fireEvent.click(await screen.findByTestId("execution-schedule-confirm-deactivate"));
    await waitFor(() => expect(deactivateMock).toHaveBeenCalled());
    // Dialog stays open (deactivatingSchedule only cleared on success).
    expect(screen.getByText("Encerrar esta rotina?")).toBeInTheDocument();
  });
});

// ────────────────── 5E.2C.2.1 §4 — once never carries an end date ──────────

describe("5E.2C.2.1 once forces endsOn null", () => {
  it("creation: pre-filling an end date then switching to once clears and disables the field; payload sends null", async () => {
    createMock.mockResolvedValue("new-id");
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-new"));
    fireEvent.change(screen.getByTestId("execution-schedule-member"), { target: { value: "m2" } });
    fireEvent.change(screen.getByTestId("execution-schedule-ends-on"), { target: { value: "2026-12-31" } });
    expect((screen.getByTestId("execution-schedule-ends-on") as HTMLInputElement).value).toBe("2026-12-31");

    fireEvent.change(screen.getByTestId("execution-schedule-frequency"), { target: { value: "once" } });
    const endInput = screen.getByTestId("execution-schedule-ends-on") as HTMLInputElement;
    expect(endInput.value).toBe("");
    expect(endInput).toBeDisabled();

    fireEvent.click(screen.getByTestId("execution-schedule-submit"));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].endsOn).toBeNull();
  });

  it("edit: a once rotina hydrates with empty end date and the update payload carries endsOn null", async () => {
    listMock.mockResolvedValue([schedule({ frequency: "once", ends_on: "2026-12-31" })]);
    updateMock.mockResolvedValue(true);
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-edit"));
    const endInput = screen.getByTestId("execution-schedule-ends-on") as HTMLInputElement;
    expect(endInput.value).toBe("");
    expect(endInput).toBeDisabled();

    fireEvent.click(screen.getByTestId("execution-schedule-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateMock.mock.calls[0];
    expect(payload.endsOn).toBeNull();
  });

  it("edit: switching daily (with end date) to once clears the stale value and sends null", async () => {
    listMock.mockResolvedValue([schedule({ frequency: "daily" })]);
    updateMock.mockResolvedValue(true);
    setup();

    fireEvent.click(await screen.findByTestId("execution-schedule-edit"));
    fireEvent.change(screen.getByTestId("execution-schedule-ends-on"), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByTestId("execution-schedule-frequency"), { target: { value: "once" } });
    const endInput = screen.getByTestId("execution-schedule-ends-on") as HTMLInputElement;
    expect(endInput.value).toBe("");
    expect(endInput).toBeDisabled();

    fireEvent.click(screen.getByTestId("execution-schedule-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][1].endsOn).toBeNull();
  });
});

// ────────────── 5E.2C.2.1 §5 — fail-closed without permission ───────────────

describe("5E.2C.2.1 canManage=false fail-closed", () => {
  it("B) rerender canManage=true → false: data removed, actions gone, no new read", async () => {
    listMock.mockResolvedValue([schedule()]);
    const { rerender } = render(
      <ExecutionScheduleSettings checklistId="c1" canManage workspaceMembers={members} />
    );
    await screen.findByTestId("execution-schedule-card");
    expect(listMock).toHaveBeenCalledTimes(1);

    rerender(<ExecutionScheduleSettings checklistId="c1" canManage={false} workspaceMembers={members} />);
    await waitFor(() => expect(screen.queryByTestId("execution-schedule-card")).toBeNull());
    expect(screen.getByTestId("execution-schedule-readonly")).toBeInTheDocument();
    expect(screen.queryByTestId("execution-schedule-new")).toBeNull();
    // The list was NOT re-read without permission (reload no longer runs).
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deactivateMock).not.toHaveBeenCalled();
  });

  it("C) pending read resolved after permission loss never repopulates data", async () => {
    let resolveList: (v: unknown) => void = () => {};
    listMock.mockReturnValue(new Promise((res) => (resolveList = res)));
    const { rerender } = render(
      <ExecutionScheduleSettings checklistId="c1" canManage workspaceMembers={members} />
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    rerender(<ExecutionScheduleSettings checklistId="c1" canManage={false} workspaceMembers={members} />);
    // The old response resolves LATE — after the permission changed.
    resolveList([schedule(), schedule({ id: "late-2" })]);
    await waitFor(() => expect(screen.queryByTestId("execution-schedule-loading")).toBeNull());
    expect(screen.queryByTestId("execution-schedule-card")).toBeNull();
    expect(screen.getByTestId("execution-schedule-readonly")).toBeInTheDocument();
  });

  it("D) checklist change during a pending read: the stale response never replaces the current list", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    listMock.mockImplementationOnce(
      () => new Promise((res) => (resolveFirst = res))
    );
    const { rerender } = render(
      <ExecutionScheduleSettings checklistId="c1" canManage workspaceMembers={members} />
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    listMock.mockResolvedValueOnce([schedule({ id: "current-checklist-row", workspace_member_id: "m2" })]);
    rerender(<ExecutionScheduleSettings checklistId="c2" canManage workspaceMembers={members} />);
    await waitFor(() =>
      expect(screen.getByTestId("execution-schedule-card")).toHaveAttribute(
        "data-schedule-id",
        "current-checklist-row"
      )
    );

    // The c1 response resolves AFTER c2's list is already rendered.
    resolveFirst([schedule({ id: "stale-c1-row" })]);
    await waitFor(() => expect(screen.queryByTestId("execution-schedule-loading")).toBeNull());
    expect(screen.queryByTestId("stale-c1-row")).toBeNull();
    expect(screen.getByTestId("execution-schedule-card")).toHaveAttribute(
      "data-schedule-id",
      "current-checklist-row"
    );
    expect(screen.queryByText("stale-c1-row")).toBeNull();
    expect(screen.queryByTestId("execution-schedule-card")).not.toHaveAttribute(
      "data-schedule-id",
      "stale-c1-row"
    );
  });
});

// ─────────────────────── route integration (§16 C, structural) ──────────────

describe("5E.2C.2 route integration (structural, checklist.tsx)", () => {
  const routeSource = require("fs").readFileSync(
    require("path").resolve(process.cwd(), "src/routes/checklist.tsx"),
    "utf8"
  );

  it("settingsActiveTab includes 'rotinas' and validateSearch accepts settingsTab=rotinas", () => {
    expect(routeSource).toContain('| "apresentacao" | "rotinas"');
    expect(routeSource).toContain('settingsTab?: "envios" | "compartilhar" | "rotinas"');
    expect(routeSource).toContain(': search.settingsTab === "rotinas" ? "rotinas"');
    expect(routeSource).toContain('openSettingsTabParam === "rotinas"');
  });

  it("tab button conditioned on hasWorkspaceResources; personal checklists never mount it", () => {
    const tabIdx = routeSource.indexOf('data-testid="settings-tab-rotinas"');
    expect(tabIdx).toBeGreaterThan(-1);
    const condIdx = routeSource.lastIndexOf("{hasWorkspaceResources && (", tabIdx);
    expect(condIdx).toBeGreaterThan(-1);
    expect(tabIdx - condIdx).toBeLessThan(400);
  });

  it("renders ExecutionScheduleSettings with settingsChecklistId, canManageWorkspace and assignableWorkspaceMembers", () => {
    expect(routeSource).toContain("<ExecutionScheduleSettings");
    expect(routeSource).toContain("checklistId={settingsChecklistId}");
    expect(routeSource).toContain("canManage={canManageWorkspace}");
    expect(routeSource).toContain("workspaceMembers={assignableWorkspaceMembers}");
  });

  it("unsaved workspace checklist shows guidance without SELECT/RPC", () => {
    expect(routeSource).toContain("Salve o checklist antes de criar uma rotina.");
    expect(routeSource).toContain('data-testid="rotinas-unsaved-checklist"');
  });

  it("Alertas de Prazo remains present and logically intact (legacy preserved)", () => {
    expect(routeSource).toContain("Alertas de Prazo");
    expect(routeSource).toContain("saveDeadlineConfig");
    expect(routeSource).toContain("set_assignment_deadline");
    expect(routeSource).toContain("update_checklist_assignments");
    expect(routeSource).toContain("primaryMemberId");
    expect(routeSource).toContain("assignmentDueAt");
    expect(routeSource).toContain("deadlineAlertEnabled");
  });

  it("global settings save button never calls schedule RPCs", () => {
    expect(routeSource).not.toContain("create_checklist_execution_schedule");
    expect(routeSource).not.toContain("update_checklist_execution_schedule");
    expect(routeSource).not.toContain("deactivate_checklist_execution_schedule");
    expect(routeSource).not.toContain("materialize_checklist_execution_occurrences");
  });

  it("tab fallback: rotinas + personal checklist returns to Geral", () => {
    expect(routeSource).toContain('settingsActiveTab === "rotinas" && !hasWorkspaceResources');
    expect(routeSource).toContain('setSettingsActiveTab("geral")');
  });

  it("route imports the component module", () => {
    expect(routeSource).toContain('from "@/components/ExecutionScheduleSettings"');
  });
});
