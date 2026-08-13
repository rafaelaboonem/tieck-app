import { createFileRoute } from '@tanstack/react-router';
import { VerifyPayloadSchema } from '@/server/camera-ai/schema';
import { validateImageBuffer } from '@/server/camera-ai/image-validation';
import { analyzeImage } from '@/server/camera-ai/openai-provider';
import { evaluateGate } from '@/server/camera-ai/gate';
import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        if (mode !== 'enabled') {
          return Response.json({ ok: false, code: 'camera_ai_disabled', message: 'IA desativada.' }, { status: 503 });
        }

        const supabaseAdmin = createServerSupabaseClient();
        if (!supabaseAdmin) {
          return Response.json({ ok: false, code: 'config_missing', message: 'Configuração do servidor ausente.' }, { status: 503 });
        }

        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey) {
          return Response.json({ ok: false, code: 'config_missing', message: 'IA não configurada.' }, { status: 500 });
        }

        try {
          const formData = await request.formData();
          const rawPayload = {
            checklistId: formData.get('checklistId'),
            blockId: formData.get('blockId'),
            responseToken: formData.get('responseToken'),
            idempotencyKey: formData.get('idempotencyKey'),
          };

          const validation = VerifyPayloadSchema.safeParse(rawPayload);
          if (!validation.success) {
            return Response.json({ ok: false, code: 'invalid_payload' }, { status: 400 });
          }

          const { checklistId, blockId, responseToken, idempotencyKey } = validation.data;
          const file = formData.get('candidate') as unknown as File | null;

          if (!file || !(file instanceof File)) {
            return Response.json({ ok: false, code: 'missing_image' }, { status: 400 });
          }

          // 1. Image Validation (Binary)
          const buffer = await file.arrayBuffer();
          const imgVal = await validateImageBuffer(buffer, file.type);
          if (!imgVal.valid) {
            return Response.json({ ok: false, code: imgVal.code, message: imgVal.message }, { status: 400 });
          }

          // 2. Authorization (Server-side hash)
          const { data: sessionData, error: sessionError } = await supabaseAdmin.rpc('resolve_public_response', {
            p_token: responseToken
          });

          if (sessionError || !sessionData || !sessionData.length) {
            return Response.json({ ok: false, code: 'unauthorized', message: 'Sessão inválida ou expirada.' }, { status: 401 });
          }

          const session = sessionData[0];
          if (session.checklist_id !== checklistId) {
            return Response.json({ ok: false, code: 'id_mismatch' }, { status: 403 });
          }

          // 3. Extract Question from Snapshot
          const blocks = session.published_content?.blocks || [];
          const block = blocks.find((b: any) => b.id === blockId);

          if (!block || block.type !== 'camera') {
            return Response.json({ ok: false, code: 'invalid_block' }, { status: 404 });
          }

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();

          // 4. Rate Limit
          const { data: limitData, error: limitError } = await supabaseAdmin.rpc('hit_public_rate_limit', {
            p_action: 'camera_ai_verify',
            p_key_hash: session.response_id,
            p_limit: 10,
            p_window_seconds: 600
          });

          if (limitError || !limitData || !limitData[0].allowed) {
            return Response.json({ ok: false, code: 'rate_limit', message: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429, headers: { 'Retry-After': '600' } });
          }

          // 5. Idempotency Check (Completed)
          const { data: existingAttempt } = await supabaseAdmin
            .from('camera_ai_attempts')
            .select('*')
            .eq('response_id', session.response_id)
            .eq('block_id', blockId)
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (existingAttempt?.status === 'completed') {
            return Response.json({
              ok: true,
              decision: existingAttempt.decision,
              code: existingAttempt.code,
              message: existingAttempt.evidence ? 'Replay da decisão anterior.' : 'Processado.',
              evidence: existingAttempt.evidence
            });
          }

          if (existingAttempt?.status === 'processing') {
            return Response.json({ ok: false, code: 'processing_conflict' }, { status: 409 });
          }

          // 6. Create/Update Attempt (Processing)
          const { error: upsertError } = await supabaseAdmin
            .from('camera_ai_attempts')
            .upsert({
              response_id: session.response_id,
              block_id: blockId,
              idempotency_key: idempotencyKey,
              status: 'processing',
              updated_at: new Date().toISOString()
            }, { onConflict: 'response_id,block_id,idempotency_key' });

          if (upsertError) {
             return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
          }

          // 7. OpenAI Inference
          const openai = new OpenAI({ apiKey });
          const model = process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini';
          const startTime = Date.now();

          let analysis;
          try {
            analysis = await analyzeImage(openai, model, question, buffer, imgVal.mimeType!);
          } catch (aiError) {
            await supabaseAdmin
              .from('camera_ai_attempts')
              .update({ status: 'failed' })
              .eq('response_id', session.response_id)
              .eq('block_id', blockId)
              .eq('idempotency_key', idempotencyKey);
            throw aiError;
          }

          const duration = Date.now() - startTime;
          const result = evaluateGate(analysis);

          // 8. Persist Final Decision
          await supabaseAdmin
            .from('camera_ai_attempts')
            .update({
              status: 'completed',
              decision: result.decision,
              code: result.code,
              evidence: result.evidence,
              model,
              duration_ms: duration,
              updated_at: new Date().toISOString()
            })
            .eq('response_id', session.response_id)
            .eq('block_id', blockId)
            .eq('idempotency_key', idempotencyKey);

          return Response.json(result);

        } catch (error) {
          console.error('[CameraAI] Verification failed (sanitized log)');
          return Response.json({ ok: false, code: 'technical_failure', message: 'Falha técnica na análise.' }, { status: 500 });
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 })
    }
  }
});
