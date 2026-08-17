import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendOverdueAssignmentEmail } from './overdue-email.server';

// Mock fetch for Resend API
global.fetch = vi.fn();

describe('sendOverdueAssignmentEmail', () => {
  const baseConfig = {
    assignmentId: 'test-id',
    checklistTitle: 'Checklist de Teste',
    workspaceName: 'Workspace Teste',
    assigneeName: 'João Silva',
    dueAt: '2026-08-17T10:00:00Z',
    ownerEmail: 'owner@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key';
  });

  it('deve gerar assunto "Prazo não cumprido" quando ainda pendente', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    
    await sendOverdueAssignmentEmail({
      ...baseConfig,
      isStillPending: true
    });

    const callArgs = (fetch as any).mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    
    expect(body.subject).toBe('Prazo não cumprido: Checklist de Teste');
    expect(body.html).toContain('Prazo expirado');
    expect(body.html).toContain('Ainda pendente');
    expect(body.html).toContain('border-left: 4px solid #e11d48'); // Red color
  });

  it('deve gerar assunto "Concluído com atraso" quando concluído', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    
    const completedAt = '2026-08-17T10:05:00Z'; // 5 mins late
    await sendOverdueAssignmentEmail({
      ...baseConfig,
      completedAt,
      isStillPending: false
    });

    const callArgs = (fetch as any).mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    
    expect(body.subject).toBe('Concluído com atraso: Checklist de Teste');
    expect(body.html).toContain('Checklist concluído com atraso');
    expect(body.html).toContain('Concluído com atraso');
    expect(body.html).toContain('5 minutos após o prazo');
    expect(body.html).toContain('border-left: 4px solid #d97706'); // Amber color
  });

  it('deve formatar completedAt corretamente no e-mail', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    
    const completedAt = '2026-08-17T10:37:00Z';
    await sendOverdueAssignmentEmail({
      ...baseConfig,
      completedAt,
      isStillPending: false
    });

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.html).toContain('Concluído em');
    // SP timezone format check (2026-08-17 10:37 UTC is 07:37 BRT)
    expect(body.html).toContain('07:37');
  });

  it('deve manter idempotência baseada em assignmentId e dueAt', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    
    await sendOverdueAssignmentEmail({
      ...baseConfig,
      isStillPending: true
    });

    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers['Idempotency-Key']).toBeDefined();
  });

  it('deve escapar caracteres HTML nos títulos e nomes', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    
    await sendOverdueAssignmentEmail({
      ...baseConfig,
      checklistTitle: 'Check <script>alert(1)</script>',
      assigneeName: 'João & Maria',
      isStillPending: true
    });

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.html).toContain('Check &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body.html).toContain('João &amp; Maria');
  });
});
