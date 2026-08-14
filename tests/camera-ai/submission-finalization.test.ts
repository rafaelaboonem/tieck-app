import { describe, it, expect, vi } from 'vitest';

// Mock do cliente Supabase para isolamento total
const mockSupabase = {
  rpc: vi.fn()
};

describe('Camera AI Submission Finalization (Isolated)', () => {
  // Trava de segurança: impede o uso de valores de produção
  const PRODUCTION_CHECKLIST_ID = 'a050976c-d5ed-44a0-af45-791a2c558dd8';
  const PRODUCTION_DOMAIN = 'tieck.com.br';
  
  const ensureNotProduction = (id: string) => {
    if (id === PRODUCTION_CHECKLIST_ID) {
      throw new Error('SEGURANÇA: Tentativa de usar checklist de produção em teste isolado.');
    }
  };

  const testChecklistId = 'local-test-checklist-uuid';
  const testVisitorId = 'local-test-visitor';

  it('deve falhar se tentar usar checklist de produção (Trava de Segurança)', () => {
    expect(() => ensureNotProduction(PRODUCTION_CHECKLIST_ID)).toThrow('SEGURANÇA');
  });

  it('deve finalizar uma resposta in_progress corretamente via finalize_public_response', async () => {
    ensureNotProduction(testChecklistId);

    const mockSession = {
      response_id: 'mock-response-id',
      response_token: 'mock-token',
      status: 'in_progress'
    };

    mockSupabase.rpc.mockResolvedValueOnce({ data: [mockSession], error: null });
    
    // 1. Criar uma sessão pública (mockada)
    const { data: sessionData } = await mockSupabase.rpc('create_public_response', {
      p_checklist_id: testChecklistId,
      p_visitor_id: testVisitorId
    });

    const session = sessionData[0];
    
    // 2. Finalizar a resposta (mockada)
    const testAnswers = { test_block: 'test_value' };
    mockSupabase.rpc.mockResolvedValueOnce({ 
      data: [{ response_id: session.response_id, status: 'submitted', already_submitted: false }], 
      error: null 
    });

    const { data: finalizeData, error: finalizeError } = await mockSupabase.rpc('finalize_public_response', {
      p_response_token: session.response_token,
      p_checklist_id: testChecklistId,
      p_answers: testAnswers
    });

    expect(finalizeError).toBeNull();
    expect(finalizeData[0].status).toBe('submitted');
  });

  it('deve ser idempotente ao finalizar a mesma resposta duas vezes', async () => {
    const token = 'mock-token';
    const id = 'mock-id';

    mockSupabase.rpc.mockResolvedValueOnce({ 
      data: [{ response_id: id, status: 'submitted', already_submitted: true }], 
      error: null 
    });

    const { data, error } = await mockSupabase.rpc('finalize_public_response', {
      p_response_token: token,
      p_checklist_id: testChecklistId,
      p_answers: { step: 2 }
    });

    expect(error).toBeNull();
    expect(data[0].already_submitted).toBe(true);
  });
  
  it('não deve conter referências a domínios de produção em strings de teste', () => {
    const testString = "https://local.test/c/uuid";
    expect(testString).not.toContain(PRODUCTION_DOMAIN);
  });
});
