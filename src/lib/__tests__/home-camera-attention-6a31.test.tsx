import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTIONABLE_RETAKE_CODES,
  isActionableCameraNonApproval,
  countActionableNonApprovals,
  buildHomeCameraAttention,
  formatNonApprovedVerificationLabel,
  resolveSubmissionsNoEvidenceLabel,
  cameraAttemptStatusLabel,
  selectLatestAttemptPerGroup,
  canLoadHomeCameraAttention,
  loadHomeCameraAttention,
  type HomeCameraAttempt,
  type HomeCameraResponse,
} from '../home-camera-attention';
import { HomeOperationalPriorities } from '../../components/home/HomeOperationalPriorities';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

const NEW = '2026-08-02T00:00:00Z';
const OLD = '2026-08-01T00:00:00Z';

const attempt = (over: Partial<HomeCameraAttempt> & { id: string; response_id: string }): HomeCameraAttempt => ({
  block_id: 'blk-1',
  status: 'completed',
  decision: 'retake',
  code: 'condition_not_met',
  completed_at: NEW,
  updated_at: NEW,
  created_at: NEW,
  ...over,
});

const response = (over: Partial<HomeCameraResponse> & { id: string; checklist_id: string }): HomeCameraResponse => ({
  submitted_at: NEW,
  created_at: NEW,
  ...over,
});

describe('Home 6A.3.1 — isActionableCameraNonApproval (semântica real)', () => {
  it('A) completed + retake + condition_not_met → atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', code: 'condition_not_met' }))).toBe(true);
  });

  it('B) completed + retake + reference_mismatch → atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', code: 'reference_mismatch' }))).toBe(true);
  });

  it('C) completed + retake + target_missing → atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', code: 'target_missing' }))).toBe(true);
  });

  it('D) completed + rejected (legacy) → atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', decision: 'rejected', code: null }))).toBe(true);
  });

  it('E) completed + retake + quality_failure → NÃO atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', code: 'quality_failure' }))).toBe(false);
  });

  it('F) completed + retake + uncertain → NÃO atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', code: 'uncertain' }))).toBe(false);
  });

  it('G) not_observable → NÃO atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', decision: 'not_observable' }))).toBe(false);
  });

  it('H) failed / technical_failure / error → NÃO atenção', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', decision: 'retake', status: 'failed' }))).toBe(false);
    expect(isActionableCameraNonApproval(attempt({ id: 'a2', response_id: 'r1', decision: 'technical_failure' }))).toBe(false);
    expect(isActionableCameraNonApproval(attempt({ id: 'a3', response_id: 'r1', decision: 'error' }))).toBe(false);
  });

  it('retake sem code (ou code desconhecido) → NÃO atenção (fail-closed)', () => {
    expect(isActionableCameraNonApproval(attempt({ id: 'a1', response_id: 'r1', code: null }))).toBe(false);
    expect(isActionableCameraNonApproval(attempt({ id: 'a2', response_id: 'r1', code: 'target_not_found' }))).toBe(false);
    expect(isActionableCameraNonApproval(attempt({ id: 'a3', response_id: 'r1', code: 'wrong_subject' }))).toBe(false);
  });

  it('ACTIONABLE_RETAKE_CODES contém exatamente os 3 códigos acionáveis', () => {
    expect([...ACTIONABLE_RETAKE_CODES].sort()).toEqual(['condition_not_met', 'reference_mismatch', 'target_missing']);
  });
});

describe('Home 6A.3.1 — última tentativa continua valendo', () => {
  it('I) retake condition_not_met antigo + approved novo → sem atenção', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'e1', code: 'condition_not_met', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'e1', decision: 'approved', code: 'verified', completed_at: NEW }),
    ];
    expect(isActionableCameraNonApproval(selectLatestAttemptPerGroup(attempts)[0])).toBe(false);
    expect(buildHomeCameraAttention(['c1'], [response({ id: 'r1', checklist_id: 'c1' })], attempts)).toEqual([]);
  });

  it('J) approved antigo + retake condition_not_met novo → atenção', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'e1', decision: 'approved', code: 'verified', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'e1', code: 'condition_not_met', completed_at: NEW }),
    ];
    expect(isActionableCameraNonApproval(selectLatestAttemptPerGroup(attempts)[0])).toBe(true);
    expect(buildHomeCameraAttention(['c1'], [response({ id: 'r1', checklist_id: 'c1' })], attempts)).toEqual([
      { checklistId: 'c1', rejectedCount: 1, latestSubmittedAt: NEW },
    ]);
  });

  it('retake condition_not_met sem evidence_id agrupa por response+block e conta', () => {
    const attempts = [attempt({ id: 'a1', response_id: 'r1', evidence_id: null, code: 'condition_not_met' })];
    expect(buildHomeCameraAttention(['c1'], [response({ id: 'r1', checklist_id: 'c1' })], attempts)).toEqual([
      { checklistId: 'c1', rejectedCount: 1, latestSubmittedAt: NEW },
    ]);
  });

  it('submissão mais antiga com retake não ressuscita quando a mais nova é limpa', () => {
    const responses = [
      response({ id: 'r-old', checklist_id: 'c1', submitted_at: OLD }),
      response({ id: 'r-new', checklist_id: 'c1', submitted_at: NEW }),
    ];
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r-old', evidence_id: 'e1', code: 'condition_not_met', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r-new', evidence_id: 'e1', decision: 'approved', code: 'verified', completed_at: NEW }),
    ];
    expect(buildHomeCameraAttention(['c1'], responses, attempts)).toEqual([]);
  });
});

describe('Home 6A.3.1 — copy (K)', () => {
  it('pluraliza corretamente 1 e 2+', () => {
    expect(formatNonApprovedVerificationLabel(1)).toBe('IA não aprovou 1 verificação');
    expect(formatNonApprovedVerificationLabel(2)).toBe('IA não aprovou 2 verificações');
    expect(formatNonApprovedVerificationLabel(0)).toBe('');
  });

  it('prioridade IA renderiza a nova copy', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const checklists = [{ id: 'c1', title: 'Loja', checklist_assignments: [] }];
    render(
      <HomeOperationalPriorities
        checklists={checklists}
        attentionByChecklist={{ c1: { rejectedCount: 2, latestSubmittedAt: NEW } }}
        onOpen={onOpen}
      />
    );
    expect(screen.getByText('IA não aprovou 2 verificações')).toBeInTheDocument();
    expect(screen.queryByText(/IA reprovou/)).toBeNull();
    await user.click(screen.getByText('Loja'));
    expect(onOpen).toHaveBeenCalledWith('c1', 'camera');
  });
});

describe('Home 6A.3.1 — Envios: sinal sem imagem persistida (L, M)', () => {
  it('L) tentativa acionável sem foto persistida → NÃO diz "Sem evidências", mostra sinal IA', () => {
    const attempts = [attempt({ id: 'a1', response_id: 'r1', evidence_id: null, code: 'condition_not_met' })];
    expect(countActionableNonApprovals(attempts)).toBe(1);
    const label = resolveSubmissionsNoEvidenceLabel({ photoCount: 0, nonApprovedCount: 1 });
    expect(label.isNonApprovedSignal).toBe(true);
    expect(label.label).toBe('1 verificação IA');
    expect(cameraAttemptStatusLabel(attempts[0])).toBe('Não aprovada pela IA');
  });

  it('M) nenhuma tentativa Camera → "Sem evidências" continua correto', () => {
    const label = resolveSubmissionsNoEvidenceLabel({ photoCount: 0, nonApprovedCount: 0 });
    expect(label.isNonApprovedSignal).toBe(false);
    expect(label.label).toBe('Sem evidências');
    expect(cameraAttemptStatusLabel(null)).toBeNull();
  });

  it('L2) retake antigo + approved novo na mesma evidência → sem sinal IA', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'e1', code: 'condition_not_met', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'e1', decision: 'approved', code: 'verified', completed_at: NEW }),
    ];
    expect(countActionableNonApprovals(attempts)).toBe(0);
  });

  it('status labels cobrem approved / not_observable / falha técnica', () => {
    expect(cameraAttemptStatusLabel(attempt({ id: 'a1', response_id: 'r1', decision: 'approved', code: 'verified' }))).toBe('Aprovada pela IA');
    expect(cameraAttemptStatusLabel(attempt({ id: 'a2', response_id: 'r1', decision: 'not_observable' }))).toBe('Não foi possível verificar');
    expect(cameraAttemptStatusLabel(attempt({ id: 'a3', response_id: 'r1', decision: 'technical_failure' }))).toBe('Verificação indisponível');
    expect(cameraAttemptStatusLabel(attempt({ id: 'a4', response_id: 'r1', decision: 'retake', status: 'processing' }))).toBeNull();
  });

  it('E2) retake quality_failure não vira sinal IA em Envios', () => {
    const attempts = [attempt({ id: 'a1', response_id: 'r1', evidence_id: null, code: 'quality_failure' })];
    expect(countActionableNonApprovals(attempts)).toBe(0);
    expect(cameraAttemptStatusLabel(attempts[0])).toBeNull();
  });
});

describe('Home 6A.3.1 — SubmissionsTab wiring (estrutura)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/SubmissionsTab.tsx'), 'utf8');

  it('badge usa resolveSubmissionsNoEvidenceLabel e mantém "Sem evidências" para o caso sem tentativas', () => {
    expect(source).toContain('resolveSubmissionsNoEvidenceLabel(');
    expect(source).toContain('"Sem evidências"');
    expect(source).toContain('countActionableNonApprovals(');
  });

  it('seção expandida mostra tentativas sem foto persistida com "Foto não armazenada" e status IA', () => {
    expect(source).toContain('cameraAttemptStatusLabel(');
    expect(source).toContain('Foto não armazenada');
    expect(source).toContain('Não aprovada pela IA');
    expect(source).toContain('evidenceIdsInAnswers');
    expect(source).toContain('orphanAttempts');
  });

  it('tipo CameraAIAttempt aceita retake/technical_failure e evidence_id nulo', () => {
    expect(source).toMatch(/decision:[^;]*'retake'/);
    expect(source).toMatch(/decision:[^;]*'technical_failure'/);
    expect(source).toMatch(/evidence_id: string \| null/);
  });
});

describe('Home 6A.3.1 — RBAC e escopo (N, O)', () => {
  it('N) Viewer continua sem query administrativa', () => {
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: true, isViewer: true, canManage: true, isAuthenticated: true })
    ).toBe(false);
  });

  it('O) loader escopado aos visibleChecklistIds e latest responses', async () => {
    const fetchResponses = vi.fn(async () => ({
      data: [response({ id: 'r1', checklist_id: 'c1' })],
      error: null,
    }));
    const fetchAttempts = vi.fn(async () => ({
      data: [attempt({ id: 'a1', response_id: 'r1', evidence_id: null, code: 'condition_not_met' })],
      error: null,
    }));
    const result = await loadHomeCameraAttention({ fetchResponses, fetchAttempts }, ['c1', 'c2']);
    expect(fetchResponses).toHaveBeenCalledWith(['c1', 'c2']);
    expect(fetchAttempts).toHaveBeenCalledWith(['r1']);
    expect(result).toEqual([{ checklistId: 'c1', rejectedCount: 1, latestSubmittedAt: NEW }]);
  });

  it('O2) falha de query → fail-closed sem prioridades IA', async () => {
    const fetchResponses = vi.fn(async () => ({ data: null, error: new Error('RLS') }));
    const fetchAttempts = vi.fn();
    expect(await loadHomeCameraAttention({ fetchResponses, fetchAttempts }, ['c1'])).toEqual([]);
    expect(fetchAttempts).not.toHaveBeenCalled();
  });

  it('hook lê tentativas via RPC seguro (6A.3.3), não por SELECT direto', () => {
    const hookSource = readFileSync(resolve(process.cwd(), 'src/hooks/useHomeCameraAttention.ts'), 'utf8');
    expect(hookSource).toContain('get_camera_ai_attempts_for_responses');
    expect(hookSource).not.toContain('.from("camera_ai_attempts")');
  });
});