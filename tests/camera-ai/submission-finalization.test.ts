import { describe, it, expect } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createHash } from 'crypto';

describe('Camera AI Submission Finalization', () => {
  const checklistId = 'a050976c-d5ed-44a0-af45-791a2c558dd8'; 
  const visitorId = 'test-visitor-' + Math.random();

  it('deve finalizar uma resposta in_progress corretamente via finalize_public_response', async () => {
    // 1. Criar uma sessão pública
    const { data: sessionData, error: sessionError } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId
    });

    expect(sessionError).toBeNull();
    const session = sessionData[0];
    const responseId = session.response_id;
    const responseToken = session.response_token;

    // 2. Finalizar a resposta
    const testAnswers = { test_block: 'test_value' };
    const { data: finalizeData, error: finalizeError } = await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: responseToken,
      p_checklist_id: checklistId,
      p_answers: testAnswers
    });

    expect(finalizeError).toBeNull();
    expect(finalizeData[0].response_id).toBe(responseId);
    expect(finalizeData[0].status).toBe('submitted');
    expect(finalizeData[0].already_submitted).toBe(false);
  });

  it('deve ser idempotente ao finalizar a mesma resposta duas vezes', async () => {
    const { data: sessionData } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId + '-idempotency'
    });
    const { response_token: token, response_id: id } = sessionData[0];

    // Primeira vez
    await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: token,
      p_checklist_id: checklistId,
      p_answers: { step: 1 }
    });

    // Segunda vez
    const { data: secondData, error: secondError } = await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: token,
      p_checklist_id: checklistId,
      p_answers: { step: 2 }
    });

    expect(secondError).toBeNull();
    expect(secondData[0].already_submitted).toBe(true);
    expect(secondData[0].response_id).toBe(id);
  });

  it('deve rejeitar token inválido', async () => {
    const { error } = await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: 'invalid-token',
      p_checklist_id: checklistId,
      p_answers: {}
    });

    expect(error).not.toBeNull();
    expect(error.message).toBe('invalid_response_token');
  });

  it('deve rejeitar evidenceId de outra resposta', async () => {
    // 1. Criar resposta A
    const { data: sessionA } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId + '-A'
    });
    // Usando evidence_id real do banco para o teste de violação de vínculo
    const evidenceId = '60b787d1-0f7f-4dcb-a904-c48208e9001a'; 
    
    // 2. Criar resposta B
    const { data: sessionB } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId + '-B'
    });

    // 3. Tentar finalizar B usando evidenceId que pertence a A
    const { error } = await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: sessionB[0].response_token,
      p_checklist_id: checklistId,
      p_answers: { pfv4z3xq: { evidenceId } }
    });

    expect(error).not.toBeNull();
    expect(error.message).toBe('invalid_evidence_id');
  });
});
