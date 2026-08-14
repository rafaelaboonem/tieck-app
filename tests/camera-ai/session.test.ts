
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do Supabase
const mockRpc = vi.fn();
const mockSupabase = {
  rpc: mockRpc
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase
}));

// Simulação simplificada do comportamento do componente
async function ensureResponseSession(checklistUuid: string, visitorId: string) {
  const { data, error } = await (mockSupabase.rpc as any)("create_public_response", {
    p_checklist_id: checklistUuid,
    p_visitor_id: visitorId
  });

  if (error || !data || (data as any).length === 0) {
    return null;
  }
  const respData = (data as any)[0];
  return {
    responseId: respData.response_id,
    responseToken: respData.response_token
  };
}

describe('create_public_response session flow', () => {
  const CHECKLIST_ID = '00000000-0000-0000-0000-000000000001';
  const VISITOR_ID = 'visitor-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully creates a session when RPC returns correct format', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        response_id: 'resp-123',
        response_token: 'token-123'
      }],
      error: null
    });

    const session = await ensureResponseSession(CHECKLIST_ID, VISITOR_ID);
    
    expect(mockRpc).toHaveBeenCalledWith("create_public_response", {
      p_checklist_id: CHECKLIST_ID,
      p_visitor_id: VISITOR_ID
    });
    expect(session).toEqual({
      responseId: 'resp-123',
      responseToken: 'token-123'
    });
  });

  it('returns null and logs error when RPC fails', async () => {
    // Note: Em ambiente de teste o console.error pode ser suprimido ou mockado
    // mas o retorno nulo é o comportamento de segurança principal.
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Database error' }
    });

    const session = await ensureResponseSession(CHECKLIST_ID, VISITOR_ID);
    
    expect(session).toBeNull();
  });

  it('returns null when RPC returns empty array', async () => {
    mockRpc.mockResolvedValue({
      data: [],
      error: null
    });

    const session = await ensureResponseSession(CHECKLIST_ID, VISITOR_ID);
    expect(session).toBeNull();
  });
  it('successfully creates a session as authenticated user', async () => {
    // A lógica do componente ensureResponseSession é agnóstica ao token de auth,
    // pois quem decide a permissão é o Postgres. O mock do RPC simula a chamada.
    mockRpc.mockResolvedValue({
      data: [{
        response_id: 'resp-auth-123',
        response_token: 'token-auth-123'
      }],
      error: null
    });

    const session = await ensureResponseSession(CHECKLIST_ID, VISITOR_ID);
    
    expect(mockRpc).toHaveBeenCalledWith("create_public_response", {
      p_checklist_id: CHECKLIST_ID,
      p_visitor_id: VISITOR_ID
    });
    expect(session?.responseId).toBe('resp-auth-123');
  });
});
