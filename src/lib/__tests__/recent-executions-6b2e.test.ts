/**
 * "Últimas execuções" — contrato REAL do /painel (6B.2E), camada pura.
 *
 * O que esta suíte protege:
 *   • parse FAIL-CLOSED do payload da RPC: linha sem conclusão/resposta, sem
 *     identidade da occurrence/checklist ou com data/hora malformada é
 *     DESCARTADA (nunca renderizada com lifecycle inventado);
 *   • a linha de apresentação nasce do dado real — `checklistId` é o do
 *     checklist (nunca o id da occurrence), o id da linha é a occurrence, e
 *     resultado/conformidade NÃO são emitidos (a occurrence não os possui);
 *   • o status reusa o helper canônico do domínio (no prazo × com atraso);
 *   • a preferência de avatar do membro (modo + id escolhido) viaja validada,
 *     junto da foto — quem decide a aparência é o MemberAvatar;
 *   • ordenação por conclusão mais recente, com desempate determinístico;
 *   • formatação de tempo curta e determinística.
 *
 * Nada aqui toca rede: o hook é testado separadamente.
 */
import { describe, it, expect } from "vitest";

import {
  buildRecentExecutions,
  executionStatusTone,
  formatExecutionOccurredAt,
  formatExecutionRelative,
  parseRecentChecklistExecutions,
  roleLabelFromRole,
  sortRecentExecutionsByCompletedDesc,
  type RecentChecklistExecutionRow,
} from "../recent-executions";

const OCCURRENCE_A = "11111111-1111-4111-8111-111111111111";
const OCCURRENCE_B = "22222222-2222-4222-8222-222222222222";
const CHECKLIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESPONSE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNIT_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Linha completa e válida da RPC — cada teste estraga só o que investiga. */
function row(overrides: Partial<RecentChecklistExecutionRow> = {}): RecentChecklistExecutionRow {
  return {
    occurrence_id: OCCURRENCE_A,
    checklist_id: CHECKLIST_A,
    checklist_title: "Checklist de abertura",
    response_id: RESPONSE_A,
    occurrence_date: "2026-09-17",
    due_at: "2026-09-17T08:00:00.000Z",
    completed_at: "2026-09-17T08:12:00.000Z",
    unit_id: UNIT_A,
    unit_name: "Unidade Norte",
    shift_id: null,
    shift_name: "Manhã",
    workspace_member_id: MEMBER_A,
    user_id: USER_A,
    responsible_name: "Juliana Prado",
    role: "editor",
    avatar_url: null,
    avatar_display_mode: null,
    illustrated_avatar_id: null,
    ...overrides,
  };
}

const NOW = new Date("2026-09-17T12:00:00");

describe("parse fail-closed do payload da RPC", () => {
  it("aceita a linha completa e preserva a identidade real", () => {
    const [parsed] = parseRecentChecklistExecutions([row()]);
    expect(parsed).toMatchObject({
      occurrenceId: OCCURRENCE_A,
      checklistId: CHECKLIST_A,
      responseId: RESPONSE_A,
      occurrenceDate: "2026-09-17",
      responsibleName: "Juliana Prado",
      workspaceMemberId: MEMBER_A,
      userId: USER_A,
      unitId: UNIT_A,
      unitName: "Unidade Norte",
      shiftName: "Manhã",
      role: "editor",
    });
    expect(parseRecentChecklistExecutions([row()])).toHaveLength(1);
  });

  it("descarta linha sem conclusão ou sem resposta vinculada", () => {
    expect(parseRecentChecklistExecutions([row({ completed_at: null })])).toHaveLength(0);
    expect(parseRecentChecklistExecutions([row({ response_id: null })])).toHaveLength(0);
    expect(parseRecentChecklistExecutions([row({ completed_at: "" })])).toHaveLength(0);
  });

  it("descarta linha sem identidade de occurrence/checklist", () => {
    expect(parseRecentChecklistExecutions([row({ occurrence_id: null })])).toHaveLength(0);
    expect(parseRecentChecklistExecutions([row({ occurrence_id: "nao-e-uuid" })])).toHaveLength(0);
    expect(parseRecentChecklistExecutions([row({ checklist_id: null })])).toHaveLength(0);
  });

  it("descarta data civil ou instante malformado", () => {
    expect(parseRecentChecklistExecutions([row({ occurrence_date: "17/09/2026" })])).toHaveLength(0);
    expect(parseRecentChecklistExecutions([row({ due_at: "ontem" })])).toHaveLength(0);
    expect(parseRecentChecklistExecutions([row({ completed_at: "17/09" })])).toHaveLength(0);
  });

  it("campos OPCIONAIS ausentes não derrubam a linha (rotina sem unidade/turno é válida)", () => {
    const [parsed] = parseRecentChecklistExecutions([
      row({ unit_id: null, unit_name: null, shift_id: null, shift_name: null }),
    ]);
    expect(parsed.unitId).toBeNull();
    expect(parsed.unitName).toBeNull();
    expect(parsed.shiftName).toBeNull();
  });

  it("payload que não é array devolve lista vazia", () => {
    expect(parseRecentChecklistExecutions(null)).toEqual([]);
    expect(parseRecentChecklistExecutions({})).toEqual([]);
    expect(parseRecentChecklistExecutions("erro")).toEqual([]);
  });

  it("sem nome, usa o fallback do produto em vez de string vazia", () => {
    const [parsed] = parseRecentChecklistExecutions([row({ responsible_name: "   " })]);
    expect(parsed.responsibleName).toBe("Membro");
  });

  it("valida a preferência de avatar: valor desconhecido vira null", () => {
    const [unknownMode] = parseRecentChecklistExecutions([
      row({ avatar_display_mode: "hologram" }),
    ]);
    expect(unknownMode.avatarDisplayMode).toBeNull();

    const [unknownId] = parseRecentChecklistExecutions([
      row({ illustrated_avatar_id: "avatar-99" }),
    ]);
    expect(unknownId.illustratedAvatarId).toBeNull();

    const [valid] = parseRecentChecklistExecutions([
      row({ avatar_display_mode: "illustrated", illustrated_avatar_id: "avatar-14" }),
    ]);
    expect(valid.avatarDisplayMode).toBe("illustrated");
    expect(valid.illustratedAvatarId).toBe("avatar-14");
  });

  it("preserva a foto real do perfil quando existe", () => {
    const [parsed] = parseRecentChecklistExecutions([
      row({ avatar_url: "https://cdn.exemplo/ana.png" }),
    ]);
    expect(parsed.avatarUrl).toBe("https://cdn.exemplo/ana.png");
  });
});

describe("ordenação canônica", () => {
  it("mais recente primeiro, com desempate por id da occurrence", () => {
    const older = parseRecentChecklistExecutions([
      row({ occurrence_id: OCCURRENCE_A, completed_at: "2026-09-17T08:12:00.000Z" }),
    ]);
    const newer = parseRecentChecklistExecutions([
      row({ occurrence_id: OCCURRENCE_B, completed_at: "2026-09-17T09:12:00.000Z" }),
    ]);

    const sorted = sortRecentExecutionsByCompletedDesc([...older, ...newer]);
    expect(sorted.map((e) => e.occurrenceId)).toEqual([OCCURRENCE_B, OCCURRENCE_A]);

    // Mesmo instante: id maior primeiro, sempre na mesma ordem.
    const tied = parseRecentChecklistExecutions([
      row({ occurrence_id: OCCURRENCE_A, completed_at: "2026-09-17T09:00:00.000Z" }),
      row({ occurrence_id: OCCURRENCE_B, completed_at: "2026-09-17T09:00:00.000Z" }),
    ]);
    expect(sortRecentExecutionsByCompletedDesc(tied).map((e) => e.occurrenceId)).toEqual([
      OCCURRENCE_B,
      OCCURRENCE_A,
    ]);
    // A ordenação não altera o array de entrada.
    expect(tied.map((e) => e.occurrenceId)).toEqual([OCCURRENCE_A, OCCURRENCE_B]);
  });
});

describe("linha de apresentação (N)", () => {
  const build = (overrides: Partial<RecentChecklistExecutionRow> = {}) =>
    buildRecentExecutions(parseRecentChecklistExecutions([row(overrides)]), NOW)[0];

  it("usa a occurrence como id da LINHA e o checklistId REAL para 'Ver Checklist'", () => {
    const item = build();
    expect(item.id).toBe(OCCURRENCE_A);
    expect(item.checklistId).toBe(CHECKLIST_A);
    expect(item.occurrenceId).toBe(OCCURRENCE_A);
    expect(item.responseId).toBe(RESPONSE_A);
    expect(item.id).not.toBe(item.checklistId);
  });

  it("trata atribuído e executor como campos separados com o mesmo valor real", () => {
    const item = build();
    expect(item.executor).toBe("Juliana Prado");
    expect(item.executorName).toBe("Juliana Prado");
    expect(item.assignedName).toBe("Juliana Prado");
    expect(item.assignedMemberId).toBe(MEMBER_A);
    expect(item.executorIdentified).toBe(true);
  });

  it("marca no prazo e com atraso pelo helper canônico do domínio", () => {
    expect(build({ completed_at: "2026-09-17T08:00:00.000Z" }).statusLabel).toBe(
      "Concluída no prazo",
    );
    expect(build({ completed_at: "2026-09-17T08:00:00.000Z" }).statusTone).toBe("done");
    expect(build({ completed_at: "2026-09-17T08:30:00.000Z" }).statusLabel).toBe(
      "Concluída com atraso",
    );
    expect(build({ completed_at: "2026-09-17T08:30:00.000Z" }).statusTone).toBe("failed");
  });

  it("NÃO inventa resultado nem conformidade", () => {
    const item = build();
    expect(item.resultLabel).toBeUndefined();
    expect(item.compliancePercentage).toBeUndefined();
  });

  it("leva foto + preferência REAL do membro para o avatar", () => {
    const item = build({
      avatar_url: "https://cdn.exemplo/juliana.png",
      avatar_display_mode: "illustrated",
      illustrated_avatar_id: "avatar-14",
    });
    expect(item.avatarUrl).toBe("https://cdn.exemplo/juliana.png");
    expect(item.avatarDisplayMode).toBe("illustrated");
    expect(item.selectedAvatarId).toBe("avatar-14");
    expect(item.memberId).toBe(MEMBER_A);
  });

  it("sem preferência salva, o avatar cai no comportamento padrão (undefined, não string)", () => {
    const item = build();
    expect(item.avatarDisplayMode).toBeNull();
    expect(item.selectedAvatarId).toBeNull();
    expect(item.avatarUrl).toBeUndefined();
  });

  it("rotula o papel no workspace e OMITE papel desconhecido", () => {
    expect(roleLabelFromRole("owner")).toBe("Proprietário");
    expect(roleLabelFromRole("admin")).toBe("Administrador");
    expect(roleLabelFromRole("editor")).toBe("Editor");
    expect(roleLabelFromRole("viewer")).toBe("Visualizador");
    expect(roleLabelFromRole("gerente")).toBeNull();
    expect(roleLabelFromRole(null)).toBeNull();
    expect(build().roleLabel).toBe("Editor");
    expect(build({ role: "gerente" }).roleLabel).toBeUndefined();
    // Nunca "Cargo": o vocabulário é papel no workspace.
    expect(JSON.stringify(build())).not.toContain("Cargo");
  });

  it("monta o contexto com unidade · turno e admite a rotina sem unidade", () => {
    expect(build().context).toBe("Unidade Norte · Manhã");
    expect(build({ shift_name: null }).context).toBe("Unidade Norte");
    expect(build({ unit_name: null, unit_id: null, shift_name: null }).context).toBe(
      "Sem unidade vinculada",
    );
  });

  it("data civil e recorte operacional chegam no item", () => {
    const item = build();
    expect(item.unitId).toBe(UNIT_A);
    expect(item.unitName).toBe("Unidade Norte");
    expect(item.shiftName).toBe("Manhã");
    expect(item.dueAt).toBe("2026-09-17T08:00:00.000Z");
    expect(item.completedAt).toBe("2026-09-17T08:12:00.000Z");
  });

  it("payload vazio produz lista vazia (estado vazio honesto)", () => {
    expect(buildRecentExecutions(parseRecentChecklistExecutions([]), NOW)).toEqual([]);
  });
});

describe("formatação de tempo", () => {
  it("rótulo relativo curto, determinístico e em português", () => {
    expect(formatExecutionRelative("2026-09-17T11:59:40", NOW)).toBe("agora");
    expect(formatExecutionRelative("2026-09-17T11:45:00", NOW)).toBe("há 15 min");
    expect(formatExecutionRelative("2026-09-17T09:00:00", NOW)).toBe("há 3 h");
    expect(formatExecutionRelative("2026-09-16T09:00:00", NOW)).toBe("ontem");
    expect(formatExecutionRelative("2026-09-12T12:00:00", NOW)).toBe("há 5 dias");
  });

  it("rótulo de ocorrência distingue hoje, ontem e data", () => {
    expect(formatExecutionOccurredAt("2026-09-17T08:12:00", NOW)).toBe("hoje · 08:12");
    expect(formatExecutionOccurredAt("2026-09-16T22:41:00", NOW)).toBe("ontem · 22:41");
    expect(formatExecutionOccurredAt("2026-09-15T22:07:00", NOW)).toBe("15/09 · 22:07");
  });

  it("ISO inválido não quebra a formatação", () => {
    expect(formatExecutionRelative("nao-e-data", NOW)).toBe("");
    expect(formatExecutionOccurredAt("nao-e-data", NOW)).toBe("");
  });

  it("tom do status: concluído é o caso comum, atraso é a exceção", () => {
    expect(executionStatusTone("concluida_no_prazo")).toBe("done");
    expect(executionStatusTone("concluida_com_atraso")).toBe("failed");
  });
});
