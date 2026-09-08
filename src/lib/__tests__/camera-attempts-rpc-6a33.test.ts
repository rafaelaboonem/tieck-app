import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countActionableNonApprovals,
  resolveSubmissionsNoEvidenceLabel,
  formatNonApprovedVerificationLabel,
  canLoadHomeCameraAttention,
  loadHomeCameraAttention,
  type HomeCameraAttempt,
} from '../home-camera-attention';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260907123000_6a33_camera_ai_attempts_read_rpc.sql'
);
const migrationSource = readFileSync(MIGRATION_PATH, 'utf8');

/**
 * Oracle que espelha EXATAMENTE a regra do RPC: o RPC junta
 * `get_checklist_access(c.id, v_uid)` com `ON ga.can_manage`, e
 * `get_checklist_access.can_manage` é:
 *   (c.user_id = p_user_id OR m.role IN ('owner','admin','editor'))
 * com m = membership ACTIVE do workspace do checklist (pessoal → sem membership
 * → só o owner).
 */
type SimChecklist = { id: string; userId: string | null; workspaceId: string | null };
type SimAttempt = { id: string; responseId: string };

export function canManageChecklistViaAccess(
  callerId: string | null,
  checklist: SimChecklist,
  activeMemberRole: string | null
): boolean {
  if (!callerId) return false;
  if (checklist.workspaceId == null) return checklist.userId === callerId;
  return activeMemberRole === 'owner' || activeMemberRole === 'admin' || activeMemberRole === 'editor';
}

export function simulateCameraAttemptsRead(opts: {
  callerId: string | null;
  attempts: SimAttempt[];
  responseChecklist: Record<string, SimChecklist>;
  activeMemberRole: (checklistId: string) => string | null;
}): SimAttempt[] {
  return opts.attempts.filter((a) => {
    const checklist = opts.responseChecklist[a.responseId];
    if (!checklist) return false;
    return canManageChecklistViaAccess(opts.callerId, checklist, opts.activeMemberRole(checklist.id));
  });
}

const attempt = (id: string, responseId: string): SimAttempt => ({ id, responseId });

const personalMine: SimChecklist = { id: 'c1', userId: 'user-1', workspaceId: null };
const personalOther: SimChecklist = { id: 'c2', userId: 'user-2', workspaceId: null };
const wsMine: SimChecklist = { id: 'c3', userId: 'owner-x', workspaceId: 'ws-1' };

describe('6A.3.3 — Migration: contrato do RPC (estrutural)', () => {
  it('é SECURITY DEFINER com search_path seguro', () => {
    expect(migrationSource).toMatch(/SECURITY DEFINER/i);
    expect(migrationSource).toMatch(/SET search_path = public, pg_temp/);
  });

  it('A) não autenticado → fail-closed (auth.uid() IS NULL → RETURN)', () => {
    expect(migrationSource).toContain('v_uid := auth.uid();');
    expect(migrationSource).toMatch(/IF v_uid IS NULL THEN\s*RETURN;/);
  });

  it('J) array vazio → zero rows (sem chamada sem IDs)', () => {
    expect(migrationSource).toMatch(/array_length\(p_response_ids, 1\) IS NULL OR array_length\(p_response_ids, 1\) = 0/);
    expect(migrationSource).toMatch(/THEN\s*RETURN;/);
  });

  it('K) mais de 100 IDs → rejeitado/fail-closed', () => {
    expect(migrationSource).toContain('> 100');
    expect(migrationSource).toContain('RETURN; -- fail-closed');
  });

  it('autorização delega ao helper canônico get_checklist_access com can_manage', () => {
    expect(migrationSource).toContain('JOIN public.get_checklist_access(c.id, v_uid) ga ON ga.can_manage');
  });

  it('H) escopo estrito: WHERE a.response_id = ANY(p_response_ids)', () => {
    expect(migrationSource).toContain('WHERE a.response_id = ANY(p_response_ids)');
  });

  it('L) NÃO retorna idempotency_key nem retry_count', () => {
    expect(migrationSource).not.toContain('idempotency_key');
    expect(migrationSource).not.toContain('retry_count');
  });

  it('grants: EXECUTE somente authenticated (e service_role), revogado de PUBLIC/anon', () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public.get_camera_ai_attempts_for_responses\(uuid\[\]\) FROM PUBLIC;/);
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public.get_camera_ai_attempts_for_responses\(uuid\[\]\) FROM anon;/);
    expect(migrationSource).toMatch(/GRANT EXECUTE ON FUNCTION public.get_camera_ai_attempts_for_responses\(uuid\[\]\) TO authenticated;/);
  });

  it('9) camera_ai_attempts continua SEM SELECT direto para authenticated', () => {
    // Nenhuma migration concede privilégio de tabela a authenticated.
    const allMigrations = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8'))
      .join('\n');
    expect(allMigrations).not.toMatch(/GRANT[^;]*SELECT[^;]*ON public\.camera_ai_attempts TO authenticated/i);
    expect(allMigrations).not.toMatch(/GRANT ALL ON public\.camera_ai_attempts TO authenticated/i);
    // A nova migration não adiciona grant de tabela.
    expect(migrationSource).not.toMatch(/GRANT[^;]*ON public\.camera_ai_attempts/i);
  });
});

describe('6A.3.3 — Autorização (matriz A–I)', () => {
  const responses: Record<string, SimChecklist> = {
    r1: personalMine,
    r2: personalOther,
    r3: wsMine,
    r4: wsMine,
  };
  const attempts = [
    attempt('a1', 'r1'),
    attempt('a2', 'r2'),
    attempt('a3', 'r3'),
    attempt('a4', 'r4'),
  ];

  it('A) não autenticado → zero acesso', () => {
    const out = simulateCameraAttemptsRead({
      callerId: null,
      attempts,
      responseChecklist: responses,
      activeMemberRole: () => 'owner',
    });
    expect(out).toEqual([]);
  });

  it('B) dono de checklist pessoal → lê as próprias respostas', () => {
    const out = simulateCameraAttemptsRead({
      callerId: 'user-1',
      attempts,
      responseChecklist: responses,
      activeMemberRole: () => null,
    });
    expect(out.map((a) => a.responseId)).toEqual(['r1']);
  });

  it('C) outro usuário em checklist pessoal → zero rows', () => {
    const out = simulateCameraAttemptsRead({
      callerId: 'user-1',
      attempts: [attempt('a2', 'r2')],
      responseChecklist: responses,
      activeMemberRole: () => null,
    });
    expect(out).toEqual([]);
  });

  it('D/E/F) workspace Owner/Admin/Editor → autorizado', () => {
    for (const role of ['owner', 'admin', 'editor']) {
      const out = simulateCameraAttemptsRead({
        callerId: 'user-1',
        attempts: [attempt('a3', 'r3')],
        responseChecklist: responses,
        activeMemberRole: () => role,
      });
      expect(out.map((a) => a.id)).toEqual(['a3']);
    }
  });

  it('G) workspace Viewer → zero rows', () => {
    const out = simulateCameraAttemptsRead({
      callerId: 'user-1',
      attempts: [attempt('a3', 'r3')],
      responseChecklist: responses,
      activeMemberRole: () => 'viewer',
    });
    expect(out).toEqual([]);
  });

  it('H) response de checklist fora do escopo → zero rows', () => {
    const out = simulateCameraAttemptsRead({
      callerId: 'user-1',
      attempts: [attempt('a-x', 'r-x')],
      responseChecklist: responses,
      activeMemberRole: () => 'owner',
    });
    expect(out).toEqual([]);
  });

  it('I) mistura autorizados + não autorizados → somente autorizados', () => {
    const out = simulateCameraAttemptsRead({
      callerId: 'user-1',
      attempts,
      responseChecklist: responses,
      activeMemberRole: () => 'editor',
    });
    expect(out.map((a) => a.responseId).sort()).toEqual(['r1', 'r3', 'r4']);
  });

  it('membership inativa não é suficiente (status != active → sem role)', () => {
    const out = simulateCameraAttemptsRead({
      callerId: 'user-1',
      attempts: [attempt('a3', 'r3')],
      responseChecklist: responses,
      activeMemberRole: () => null, // simulando membership inexistente/inativa
    });
    expect(out).toEqual([]);
  });
});

describe('6A.3.3 — Integração client (M–R)', () => {
  const submissionsSource = readFileSync(resolve(process.cwd(), 'src/components/SubmissionsTab.tsx'), 'utf8');
  const hookSource = readFileSync(resolve(process.cwd(), 'src/hooks/useHomeCameraAttention.ts'), 'utf8');

  it('M) SubmissionsTab usa o RPC, não SELECT direto', () => {
    expect(submissionsSource).toContain('get_camera_ai_attempts_for_responses');
    expect(submissionsSource).not.toContain('.from("camera_ai_attempts")');
  });

  it('N) useHomeCameraAttention usa o RPC', () => {
    expect(hookSource).toContain('get_camera_ai_attempts_for_responses');
    expect(hookSource).not.toContain('.from("camera_ai_attempts")');
  });

  it('O) retake condition_not_met retornado pelo RPC → badge "1 verificação IA"', () => {
    const attempts: HomeCameraAttempt[] = [
      {
        id: 'a1',
        response_id: 'r1',
        block_id: 'b1',
        status: 'completed',
        decision: 'retake',
        code: 'condition_not_met',
        completed_at: '2026-09-01T10:00:00Z',
      },
    ];
    expect(countActionableNonApprovals(attempts)).toBe(1);
    const badge = resolveSubmissionsNoEvidenceLabel({ photoCount: 0, nonApprovedCount: 1 });
    expect(badge.label).toBe('1 verificação IA');
  });

  it('P) mesmo dado → Home "IA não aprovou 1 verificação"', () => {
    expect(formatNonApprovedVerificationLabel(1)).toBe('IA não aprovou 1 verificação');
  });

  it('Q) Viewer hook continua sem chamar o RPC (gate duplo)', () => {
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: true, isViewer: true, canManage: true, isAuthenticated: true })
    ).toBe(false);
    // A rota /inicio continua condicionando o hook ao gate RBAC.
    const inicioSource = readFileSync(resolve(process.cwd(), 'src/routes/inicio.tsx'), 'utf8');
    expect(inicioSource).toContain('canLoadHomeCameraAttention({');
    expect(inicioSource).toContain('useHomeCameraAttention({');
  });

  it('R) erro do RPC → Home fail-closed (retorna vazio, não quebra)', async () => {
    const fetchResponses = vi.fn(async () => ({
      data: [{ id: 'r1', checklist_id: 'c1', submitted_at: '2026-09-01T10:00:00Z', created_at: '' }],
      error: null,
    }));
    const fetchAttempts = vi.fn(async () => ({ data: null, error: new Error('permission denied') }));
    const result = await loadHomeCameraAttention({ fetchResponses, fetchAttempts }, ['c1']);
    expect(result).toEqual([]);
  });
});