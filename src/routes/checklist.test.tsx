import { describe, it, expect, vi } from 'vitest';
import { toLocalISO, fromLocalISO } from '@/utils/date-helpers';

describe('Fase 4C.7 — Transferência Segura de Prazo', () => {
  it('converte corretamente Timezone entre LOCAL e UTC', () => {
    const utcString = "2026-08-17T18:30:00.000Z";
    const date = new Date(utcString);
    const localISO = toLocalISO(date);
    
    const [d, t] = localISO.split('T');
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t).toMatch(/^\d{2}:\d{2}$/);
    
    const backToUTC = fromLocalISO(localISO);
    expect(backToUTC).toBe(date.toISOString());
  });

  it('trocar primary limpa due_at do antigo assignment simulado', () => {
    let assignments: any[] = [
      { id: 'a1', workspace_member_id: 'm1', is_primary: true, due_at: '2026-08-17T18:30:00Z' },
      { id: 'a2', workspace_member_id: 'm2', is_primary: false, due_at: null }
    ];

    const existingPrimary = assignments.find(a => a.is_primary);
    const newPrimaryMemberId = 'm2';
    const newDueAt = '2026-08-18T10:00:00Z';

    // Simulação da lógica de saveDeadlineConfig
    if (existingPrimary && existingPrimary.workspace_member_id !== newPrimaryMemberId) {
      // 1. update_checklist_assignments (muda is_primary)
      assignments = assignments.map(a => ({
        ...a,
        is_primary: a.workspace_member_id === newPrimaryMemberId
      }));

      // 2. set_assignment_deadline para o novo
      assignments = assignments.map(a => {
        if (a.workspace_member_id === newPrimaryMemberId) {
          return { ...a, due_at: newDueAt };
        }
        return a;
      });

      // 3. Limpa due_at do antigo primary (CORREÇÃO 4C.7)
      assignments = assignments.map(a => {
        if (a.id === existingPrimary.id && a.workspace_member_id !== newPrimaryMemberId) {
          return { ...a, due_at: null };
        }
        return a;
      });
    }

    const oldOne = assignments.find(a => a.id === 'a1');
    const newOne = assignments.find(a => a.id === 'a2');

    expect(oldOne?.is_primary).toBe(false);
    expect(oldOne?.due_at).toBeNull();
    expect(newOne?.is_primary).toBe(true);
    expect(newOne?.due_at).toBe(newDueAt);
  });

  it('antigo assignment não é deletado e mantem completed_at', () => {
    const completedAt = '2026-08-16T12:00:00Z';
    let assignments: any[] = [
      { id: 'a1', workspace_member_id: 'm1', is_primary: true, due_at: '2026-08-17T18:30:00Z', completed_at: completedAt }
    ];

    const existingPrimary = assignments[0];
    const newPrimaryMemberId = 'm2';

    // Simulação: Adiciona novo e remove primary do antigo
    assignments.push({ id: 'a2', workspace_member_id: 'm2', is_primary: true, due_at: '2026-08-18T10:00:00Z', completed_at: null });
    assignments[0].is_primary = false;
    assignments[0].due_at = null; // A correção 4C.7

    expect(assignments.length).toBe(2);
    expect(assignments[0].id).toBe('a1');
    expect(assignments[0].completed_at).toBe(completedAt);
    expect(assignments[0].due_at).toBeNull();
  });

  it('refresh final com erro não deve mostrar sucesso (simulação)', async () => {
    const loadDeadlineAssignmentState = vi.fn().mockResolvedValue({ ok: false });
    const toastSuccess = vi.fn();
    const toastError = vi.fn();

    const save = async () => {
      try {
        // ... operações de banco ...
        const refresh = await loadDeadlineAssignmentState();
        if (!refresh.ok) throw new Error("Erro ao sincronizar");
        toastSuccess("Sucesso");
      } catch (e: any) {
        toastError(e.message);
      }
    };

    await save();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Erro ao sincronizar");
  });
});