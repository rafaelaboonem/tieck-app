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
    default: function OpenAI() {
      this.responses = {
        parse: mockParse
      };
    }
  };
});

describe('POST /api/camera-ai/compile-policy Authorization & OpenAI', () => {
  const checklistId = 'c1234567-89ab-cdef-0123-456789abcdef';
  const blockId = 'b1234567-89ab-cdef-0123-456789abcdef';

  const mockChecklist = {
    id: checklistId,
    blocks: [{ id: blockId, type: 'camera', title: 'Test', description: '' }],
    workspace_id: 'w1234567-89ab-cdef-0123-456789abcdef',
    user_id: 'u1234567-89ab-cdef-0123-456789abcdef'
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(401);
  });

  it('Retorna 403 se o usuário não for proprietário e nem membro ativo', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(403);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('Retorna 403 se for membro inativo', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: { status: 'inactive', role: 'admin' }, error: null });

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(403);
  });

  it('Retorna 403 se for membro viewer', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: { status: 'active', role: 'viewer' }, error: null });

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(403);
  });

  it('Permite compilação se o usuário for o proprietário direto (user_id)', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: mockChecklist.user_id } }, error: null });
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
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.policy.source).toBe('generated');
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('Permite compilação se for membro ativo admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin1' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: { status: 'active', role: 'admin' }, error: null });
    
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
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(200);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('Permite compilação se for membro ativo editor', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'editor1' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: { status: 'active', role: 'editor' }, error: null });
    
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
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(200);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('Usa cache se a política for válida e hash coincidir', async () => {
    const question = "Test"; // Title "Test", empty description
    const { createHash } = await import('crypto');
    const questionHash = createHash('sha256').update(question.trim()).digest('hex');

    const checklistWithPolicy = {
      ...mockChecklist,
      blocks: [{
        ...mockChecklist.blocks[0],
        cameraAiPolicy: {
          verifiability: 'visual',
          target: 'Test',
          condition: 'present',
          targetDescription: 'D',
          conditionDescription: 'C',
          requiredVisibleEvidence: [],
          rejectionSignals: [],
          notObservableSignals: [],
          summary: 'S',
          version: 1,
          questionHash,
          source: 'generated'
        }
      }]
    };

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: mockChecklist.user_id } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: checklistWithPolicy, error: null });

    const request = new Request('http://localhost/api/camera-ai/compile-policy', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(200);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('Ignora cache e chama OpenAI se o hash divergir', async () => {
    const question = "Test";
    const { createHash } = await import('crypto');
    const wrongHash = createHash('sha256').update("Wrong Question").digest('hex');

    const checklistWithPolicy = {
      ...mockChecklist,
      blocks: [{
        ...mockChecklist.blocks[0],
        cameraAiPolicy: {
          verifiability: 'visual',
          target: 'Test',
          condition: 'present',
          targetDescription: 'D',
          conditionDescription: 'C',
          requiredVisibleEvidence: [],
          rejectionSignals: [],
          notObservableSignals: [],
          summary: 'S',
          version: 1,
          questionHash: wrongHash,
          source: 'generated'
        }
      }]
    };

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: mockChecklist.user_id } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: checklistWithPolicy, error: null });
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
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    await handler({ request });
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('Recompila se a política no cache for malformada', async () => {
    const checklistWithBadPolicy = {
      ...mockChecklist,
      blocks: [{
        ...mockChecklist.blocks[0],
        cameraAiPolicy: {
          version: 1,
          // Missing required fields
        }
      }]
    };

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: mockChecklist.user_id } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: checklistWithBadPolicy, error: null });
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
      headers: { 
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ checklistId, blockId })
    });
    
    const handler = (Route as any).options.server.handlers.POST;
    await handler({ request });
    expect(mockParse).toHaveBeenCalledTimes(1);
  });
});