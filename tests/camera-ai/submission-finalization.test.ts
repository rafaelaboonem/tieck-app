import { describe, it, expect, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createHash } from 'crypto';

describe('Camera AI Submission Finalization', () => {
  const checklistId = 'a050976c-d5ed-44a0-af45-791a2c558dd8'; // ID do checklist de teste identificado
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

    // 2. Verificar estado inicial: in_progress
    const { data: initialResp } = await supabase
      .from('checklist_responses')
      .select('status, submitted_at')
      .eq('id', responseId)
      .single();
    
    expect(initialResp?.status).toBe('in_progress');
    expect(initialResp?.submitted_at).toBeNull();

    // 3. Finalizar a resposta
    const testAnswers = { test_block: 'test_value' };
    const { data: finalizeData, error: finalizeError } = await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: responseToken,
      p_checklist_id: checklistId,
      p_answers: testAnswers
    });

    if (finalizeError) console.error('Finalize error:', finalizeError);
    expect(finalizeError).toBeNull();
    expect(finalizeData[0].response_id).toBe(responseId);
    expect(finalizeData[0].status).toBe('submitted');
    expect(finalizeData[0].already_submitted).toBe(false);

    // 4. Verificar estado final no banco
    const { data: finalResp } = await supabase
      .from('checklist_responses')
      .select('status, submitted_at, answers')
      .eq('id', responseId)
      .single();

    expect(finalResp?.status).toBe('submitted');
    expect(finalResp?.submitted_at).not.toBeNull();
    expect(finalResp?.answers).toEqual(testAnswers);
  });

  it('deve ser idempotente ao finalizar a mesma resposta duas vezes', async () => {
    const { data: sessionData } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId + '-idempotency'
    });
    const { response_token: token } = sessionData[0];

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
      p_answers: { step: 2 } // O answers não deve mudar se já estiver submitted
    });

    expect(secondError).toBeNull();
    expect(secondData[0].already_submitted).toBe(true);
    
    const { data: finalResp } = await supabase
      .from('checklist_responses')
      .select('answers')
      .eq('response_token_hash', createHash('sha256').update(token).digest('hex'))
      .single();
    
    expect(finalResp?.answers).toEqual({ step: 1 });
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
    // 1. Criar resposta A com evidência
    const { data: sessionA } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId + '-A'
    });
    const evidenceId = '60b787d1-0f7f-4dcb-a904-c48208e9001a'; // ID de evidência real vindo do banco (vincular na mão para teste)
    
    // 2. Criar resposta B
    const { data: sessionB } = await (supabase.rpc as any)('create_public_response', {
      p_checklist_id: checklistId,
      p_visitor_id: visitorId + '-B'
    });

    // 3. Tentar finalizar B usando evidenceId que pertence a A (ou pelo menos não a B)
    const { error } = await (supabase.rpc as any)('finalize_public_response', {
      p_response_token: sessionB[0].response_token,
      p_checklist_id: checklistId,
      p_answers: { pfv4z3xq: { evidenceId } }
    });

    // Como evidence_id 60b787d1 pertence ao response_id b2615ef0 (identificado no log anterior),
    // e sessionB tem um novo response_id, a validação P0003 deve disparar.
    expect(error).not.toBeNull();
    expect(error.message).toBe('invalid_evidence_id');
  });
});
