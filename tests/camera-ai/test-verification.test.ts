import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route } from '../../src/routes/api/camera-ai/test-verification';
import { createHash } from 'crypto';

// Mock Supabase
vi.mock('@/integrations/supabase/client.server', () => ({
  createServerSupabaseClient: vi.fn()
}));

// Mock OpenAI Provider
vi.mock('../../src/server/camera-ai/openai-provider', () => ({
  analyzeImage: vi.fn()
}));

// Mock Image Validation
vi.mock('../../src/server/camera-ai/image-validation', () => ({
  validateImageBuffer: vi.fn()
}));

describe('POST /api/camera-ai/test-verification', () => {
  const checklistId = 'c1234567-89ab-cdef-0123-456789abcdef';
  const blockId = 'a8k2p9xz';
  const userId = 'u1234567-89ab-cdef-0123-456789abcdef';
  const workspaceId = 'w1234567-89ab-cdef-0123-456789abcdef';

  const mockChecklist = {
    id: checklistId,
    blocks: [{ 
      id: blockId, 
      type: 'camera', 
      title: 'Test', 
      description: '',
      cameraAiPolicy: {
        version: 1,
        verifiability: 'visual',
        target: 'Test',
        condition: 'present',
        targetDescription: 'D',
        conditionDescription: 'C',
        requiredVisibleEvidence: [],
        rejectionSignals: [],
        notObservableSignals: [],
        summary: 'S',
        questionHash: createHash('sha256').update('Test').digest('hex'),
        source: 'generated'
      }
    }],
    workspace_id: workspaceId,
    user_id: userId
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
    process.env['CAMERA_AI_MODE'] = 'enabled';
    process.env['OPENAI_API_KEY'] = 'test-key';
    const { createServerSupabaseClient } = await import('@/integrations/supabase/client.server');
    (createServerSupabaseClient as any).mockReturnValue(mockSupabase);
  });

  const getHandler = () => (Route as any).options.server.handlers.POST;

  const createTestRequest = async (fields: Record<string, any> = {}, token?: string) => {
    const formData = new FormData();
    formData.append('checklistId', fields.checklistId ?? checklistId);
    formData.append('blockId', fields.blockId ?? blockId);
    
    if (fields.candidate !== null) {
      // Use a real File/Blob for Vitest environment
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      formData.append('candidate', fields.candidate ?? blob, 'test.jpg');
    }

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // IMPORTANT: Let the Request constructor handle the boundary
    return new Request('http://localhost/api/camera-ai/test-verification', {
      method: 'POST',
      headers,
      body: formData
    });
  };

  it('Retorna 503 se a IA estiver desativada', async () => {
    process.env['CAMERA_AI_MODE'] = 'disabled';
    const request = await createTestRequest();
    const response = await getHandler()({ request });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('camera_ai_disabled');
  });

  it('Retorna 401 se não houver token', async () => {
    const request = await createTestRequest();
    const response = await getHandler()({ request });
    expect(response.status).toBe(401);
  });

  it('Retorna 401 se o token for inválido', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid token') });
    const request = await createTestRequest({}, 'invalid-token');
    const response = await getHandler()({ request });
    expect(response.status).toBe(401);
  });

  it('Permite acesso ao proprietário direto', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    
    const { validateImageBuffer } = await import('../../src/server/camera-ai/image-validation');
    (validateImageBuffer as any).mockResolvedValue({ valid: true, mimeType: 'image/jpeg' });
    
    const { analyzeImage } = await import('../../src/server/camera-ai/openai-provider');
    (analyzeImage as any).mockResolvedValue({
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: true,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: ['item'],
      negative_visible_evidence: [],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: 'Ok'
    });

    const request = await createTestRequest({}, 'valid-token');
    const response = await getHandler()({ request });
    const body = await response.json();
    
    if (response.status !== 200) console.log('DEBUG 200 Test Failure:', JSON.stringify(body));
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('Retorna 403 para membro ativo de outro workspace', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

    const request = await createTestRequest({}, 'valid-token');
    const response = await getHandler()({ request });
    expect(response.status).toBe(403);
  });

  it('Permite acesso a editor ativo do workspace', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'editor-id' } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });
    mockSupabase.maybeSingle.mockResolvedValue({ data: { status: 'active', role: 'editor' }, error: null });

    const { validateImageBuffer } = await import('../../src/server/camera-ai/image-validation');
    (validateImageBuffer as any).mockResolvedValue({ valid: true, mimeType: 'image/jpeg' });
    
    const { analyzeImage } = await import('../../src/server/camera-ai/openai-provider');
    (analyzeImage as any).mockResolvedValue({
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: true,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: ['item'],
      negative_visible_evidence: [],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: 'Ok'
    });

    const request = await createTestRequest({}, 'valid-token');
    const response = await getHandler()({ request });
    expect(response.status).toBe(200);
  });

  it('Retorna 404 se o checklist não existir', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const request = await createTestRequest({}, 'valid-token');
    const response = await getHandler()({ request });
    expect(response.status).toBe(404);
  });

  it('Retorna 404 se o bloco não existir no checklist', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mockSupabase.single.mockResolvedValue({ data: mockChecklist, error: null });

    const request = await createTestRequest({ blockId: 'non-existent' }, 'valid-token');
    const response = await getHandler()({ request });
    expect(response.status).toBe(404);
  });
});
