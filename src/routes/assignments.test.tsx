import { describe, it, expect, vi } from 'vitest';
import { getAssignmentStatus } from '../utils/assignment-status';

describe('Assignment Lifecycle & Logic', () => {
  it('identifies pending assignment without deadline', () => {
    const status = getAssignmentStatus(null, null);
    expect(status).toBe('sem_prazo');
  });

  it('identifies completed assignment', () => {
    const dueAt = new Date(Date.now() + 10000).toISOString();
    const completedAt = new Date().toISOString();
    const status = getAssignmentStatus(dueAt, completedAt);
    expect(status).toBe('concluido');
  });

  it('identifies overdue assignment', () => {
    const dueAt = new Date(Date.now() - 10000).toISOString();
    const status = getAssignmentStatus(dueAt, null);
    expect(status).toBe('atrasado');
  });

  it('identifies pending assignment with future deadline', () => {
    const dueAt = new Date(Date.now() + 10000).toISOString();
    const status = getAssignmentStatus(dueAt, null);
    expect(status).toBe('pendente');
  });
});
