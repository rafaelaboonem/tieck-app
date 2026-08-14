import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route } from '../../src/routes/api/camera-ai/compile-policy';
import { CameraVerificationPolicyV1Schema } from '../../src/server/camera-ai/schema';

// Mock Supabase
vi.mock('@/integrations/supabase/client.server', () => ({
  createServerSupabaseClient: vi.fn()
}));

// Mock OpenAI
const mockParse = vi.fn();
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        parse: mockParse
      }
    }))
  };
});

describe('POST /api/camera-ai/compile-policy Authorization & OpenAI', () => {
  const mockChecklist = {
    id: 'c1',
    blocks: [{ id: 'b1', type: 'camera', title: 'Test', description: '' }],
    workspace_id: 'w1',
    owner_id: 'u1'
  };

  const mockSupabase = {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn()
  };

   beforeEach(async () => {
     vi.clearAllMocks();
     process.env['OPENAI_API_KEY'] = 'test-key';
     process.env['SUPABASE_URL'] = 'test-url';
     process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-key';
     const { createServerSupabaseClient } = await import('@/integrations/supabase/client.server');
     (createServerSupabaseClient as any).mockReturnValue(mockSupabase);
   });

  it('Retorna 401 se não houver token', async () => {
    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      body: JSON.stringify({ checklistId: 'c1', blockId: 'b1' })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(401);
  });

  it('Retorna 403 se o usuário não tiver acesso ao workspace', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); // No workspace membership

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token' },
      body: JSON.stringify({ checklistId: 'c1', blockId: 'b1' })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(403);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('Permite compilação se o usuário for o proprietário', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    
    mockParse.mockResolvedValue({
      output_parsed: {
        verifiability: 'visual',
        target: 'Test',
        condition: 'present',
        targetDescription: 'A test object',
        conditionDescription: 'Should be present',
        requiredVisibleEvidence: ['test'],
        rejectionSignals: [],
        notObservableSignals: [],
        summary: 'Test summary'
      }
    });

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token' },
      body: JSON.stringify({ checklistId: 'c1', blockId: 'b1' })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.policy.source).toBe('generated');
    expect(data.policy.version).toBe(1);
  });

  it('Chama OpenAI exatamente uma vez para nova política', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockParse.mockResolvedValue({ output_parsed: { verifiability: 'visual', target: 'X', condition: 'Y', targetDescription: 'D', conditionDescription: 'C', requiredVisibleEvidence: [], rejectionSignals: [], notObservableSignals: [], summary: 'S' } });

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token' },
      body: JSON.stringify({ checklistId: 'c1', blockId: 'b1' })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    await handler({ request });
    
    expect(mockParse).toHaveBeenCalledTimes(1);
  });
});
