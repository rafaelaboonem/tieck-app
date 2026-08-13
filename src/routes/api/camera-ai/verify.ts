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
        // 1. CAMERA_AI_MODE
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        if (mode !== 'enabled') {
          return Response.json({ ok: false, code: 'camera_ai_disabled', message: 'IA desativada.' }, { status: 503 });
        }

        // 2. Server-only config
        const supabaseAdmin = createServerSupabaseClient();
        if (!supabaseAdmin) {
          return Response.json({ ok: false, code: 'config_missing', message: 'Configuração do servidor ausente.' }, { status: 503 });
        }

        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey) {
          return Response.json({ ok: false, code: 'config_missing', message: 'IA não configurada.' }, { status: 500 });
        }

        try {
          // 3. Multipart
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
          const file = formData.get('candidate');

          if (!file || !(file instanceof File)) {
            return Response.json({ ok: false, code: 'missing_image' }, { status: 400 });
          }

          // 4. Binary Image Validation
          const buffer = await file.arrayBuffer();
          const imgVal = await validateImageBuffer(buffer, file.type);
          if (!imgVal.valid) {
            return Response.json({ ok: false, code: imgVal.code, message: imgVal.message }, { status: 400 });
          }

          // 5. Session Hash & Expiration
          const { data: sessionData, error: sessionError } = await supabaseAdmin.rpc('resolve_public_response', {
            p_token: responseToken
          });

          if (sessionError || !sessionData || !sessionData.length) {
            return Response.json({ ok: false, code: 'unauthorized', message: 'Sessão inválida ou expirada.' }, { status: 401 });
          }

          const session = sessionData[0];

          // 6. Checklist & Block Validation
          if (session.checklist_id !== checklistId) {
            return Response.json({ ok: false, code: 'id_mismatch' }, { status: 403 });
          }

          interface PublishedBlock {
            id: string;
            type: string;
            title?: string;
            description?: string;
          }

          const blocks: PublishedBlock[] = session.published_content?.blocks || [];
          const block = blocks.find((b) => b.id === blockId);

          if (!block || block.type !== 'camera') {
            return Response.json({ ok: false, code: 'invalid_block' }, { status: 404 });
          }

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();

          // 7 & 8. Replay & Atomic Claim
          const { data: claimData, error: claimError } = await supabaseAdmin.rpc('claim_camera_ai_attempt', {
            p_response_id: session.response_id,
            p_block_id: blockId,
            p_idempotency_key: idempotencyKey
          });

          if (claimError || !claimData || !claimData.length) {
            return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
          }

          const claim = claimData[0];

          // Replay Completed
          if (claim.claim_status === 'completed') {
            return Response.json({
              ok: true,
              decision: claim.existing_decision,
              code: claim.existing_code,
              message: 'Replay da decisão anterior.',
              evidence: claim.existing_evidence
            });
          }

          // Concurrent Processing
          if (claim.claim_status === 'processing') {
            return Response.json({ ok: false, code: 'processing_conflict' }, { status: 409 });
          }

          // Handle Failed (Retry logic could be here, but for now we block if not acquired)
          if (claim.claim_status !== 'acquired') {
            return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
          }

          // 9. Rate Limit (for truly new attempts)
          // RPC signature: hit_public_rate_limit(p_key_hash text, p_action text, p_window_seconds integer, p_limit integer)
          const { data: limitData, error: limitError } = await supabaseAdmin.rpc('hit_public_rate_limit', {
            p_key_hash: String(session.response_id),
            p_action: 'camera_ai_verify',
            p_window_seconds: 600,
            p_limit: 10
          });

          if (limitError || !limitData || !limitData[0]?.allowed) {
            // Se negado, marcamos a tentativa adquirida como falha por rate limit
            await supabaseAdmin
              .from('camera_ai_attempts')
              .update({ 
                status: 'failed', 
                code: 'rate_limit',
                updated_at: new Date().toISOString() 
              })
              .match({ 
                response_id: session.response_id, 
                block_id: blockId, 
                idempotency_key: idempotencyKey,
                status: 'processing'
              });

            return Response.json({ ok: false, code: 'rate_limit', message: 'Muitas tentativas.' }, { status: 429, headers: { 'Retry-After': '600' } });
          }

          // 10. OpenAI
          const openai = new OpenAI({ apiKey });
          const model = process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini';
          const startTime = Date.now();

          let analysis;
          try {
            analysis = await analyzeImage(openai, model, question, buffer, imgVal.mimeType!);
          } catch (aiError) {
            await supabaseAdmin
              .from('camera_ai_attempts')
              .update({ 
                status: 'failed', 
                code: 'provider_failure',
                updated_at: new Date().toISOString() 
              })
              .match({ 
                response_id: session.response_id, 
                block_id: blockId, 
                idempotency_key: idempotencyKey,
                status: 'processing'
              });
            throw aiError;
          }

          const duration = Date.now() - startTime;
          
          // 11. Gate
          const result = evaluateGate(analysis);

          // 12. Final Persistence Confirmation
          const { data: finalUpdate, error: finalError } = await supabaseAdmin
            .from('camera_ai_attempts')
            .update({
              status: 'completed',
              decision: result.decision,
              code: result.code,
              evidence: result.evidence,
              model,
              duration_ms: duration,
              updated_at: new Date().toISOString(),
              completed_at: new Date().toISOString()
            })
            .match({ 
              response_id: session.response_id, 
              block_id: blockId, 
              idempotency_key: idempotencyKey,
              status: 'processing' // Guard condition: only update if still processing
            })
            .select('id')
            .maybeSingle();

          if (finalError || !finalUpdate) {
            return Response.json({ 
              ok: false, 
              decision: 'technical_failure', 
              code: 'persistence_error',
              message: 'Falha ao confirmar persistência.'
            }, { status: 500 });
          }

          // 13. Sanitized Response
          return Response.json(result);

        } catch (error) {
          console.error('[CameraAI] Verification failed (sanitized log)');
          return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 })
    }
  }
});
