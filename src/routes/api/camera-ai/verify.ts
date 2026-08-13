import { createFileRoute } from '@tanstack/react-router';
import { VerifyPayloadSchema } from '@/server/camera-ai/schema';
import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { verifyCameraRequest, VerifyDependencies } from '@/server/camera-ai/verify-handler';
import { analyzeImage } from '@/server/camera-ai/openai-provider';

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        const supabaseAdmin = createServerSupabaseClient();
        const apiKey = process.env['OPENAI_API_KEY'];
        const model = process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini';

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

          const file = formData.get('candidate');
          if (!file || !(file instanceof File)) {
            return Response.json({ ok: false, code: 'missing_image' }, { status: 400 });
          }

          const buffer = await file.arrayBuffer();
          
          const deps: VerifyDependencies = {
            mode,
            openai: (apiKey ? new OpenAI({ apiKey }) : null) as any,
            model,
            supabaseAdmin: supabaseAdmin as any, // Cast to avoid complex interface mismatch
            now: () => new Date(),
            resolveSession: async (token) => {
              if (!supabaseAdmin) return { data: null, error: 'no_client' };
              return supabaseAdmin.rpc('resolve_public_response', { p_token: token });
            },
            claimAttempt: async ({ responseId, blockId, idempotencyKey }) => {
              if (!supabaseAdmin) return { data: null, error: 'no_client' };
              return supabaseAdmin.rpc('claim_camera_ai_attempt', {
                p_response_id: responseId,
                p_block_id: blockId,
                p_idempotency_key: idempotencyKey
              });
            },
            hitRateLimit: async (responseId) => {
              if (!supabaseAdmin) return { data: null, error: 'no_client' };
              return supabaseAdmin.rpc('hit_public_rate_limit', {
                p_key_hash: String(responseId),
                p_action: 'camera_ai_verify',
                p_window_seconds: 600,
                p_limit: 10
              });
            },
            analyzeImage: async (openai, model, question, buffer, mimeType) => {
              return analyzeImage(openai, model, question, buffer, mimeType);
            },
            markFailed: async ({ responseId, blockId, idempotencyKey, code }) => {
              if (!supabaseAdmin) return { data: null, error: 'no_client' };
              return supabaseAdmin
                .from('camera_ai_attempts')
                .update({ 
                  status: 'failed', 
                  code: code,
                  updated_at: new Date().toISOString() 
                })
                .match({ 
                  response_id: responseId, 
                  block_id: blockId, 
                  idempotency_key: idempotencyKey,
                  status: 'processing'
                });
            },
            markCompleted: async (params) => {
              if (!supabaseAdmin) return { data: null, error: 'no_client' };
              return supabaseAdmin
                .from('camera_ai_attempts')
                .update({
                  status: 'completed',
                  decision: params.decision,
                  code: params.code,
                  evidence: params.evidence,
                  model: params.model,
                  duration_ms: params.durationMs,
                  updated_at: params.at.toISOString(),
                  completed_at: params.at.toISOString()
                })
                .match({ 
                  response_id: params.responseId, 
                  block_id: params.blockId, 
                  idempotency_key: params.idempotencyKey,
                  status: 'processing'
                })
                .select('id')
                .maybeSingle();
            }
          };

          const result = await verifyCameraRequest(
            validation.data,
            { buffer, type: file.type },
            deps
          );

          return Response.json(result.body, { status: result.status });

        } catch (error) {
          console.error('[CameraAI] Verification failed (sanitized log)');
          return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 })
    }
  }
});
