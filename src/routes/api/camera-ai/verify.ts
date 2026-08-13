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
        
        if (mode !== 'enabled') {
          return Response.json({ ok: false, code: 'camera_ai_disabled' }, { status: 503 });
        }

        const apiKey = process.env['OPENAI_API_KEY'];
        const supabaseUrl = process.env['SUPABASE_URL'];
        const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
          return Response.json({ ok: false, code: 'config_missing', message: 'Configuração do servidor incompleta.' }, { status: 503 });
        }

        const openai = new OpenAI({ apiKey });
        const supabaseAdmin = createServerSupabaseClient();
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
            model,
            now: () => new Date(),
            isConfigured: () => true,
            resolveSession: async (token: string) => {
              return supabaseAdmin.rpc('resolve_public_response', { p_token: token });
            },
            claimAttempt: async ({ responseId, blockId, idempotencyKey }: { responseId: string; blockId: string; idempotencyKey: string }) => {
              return supabaseAdmin.rpc('claim_camera_ai_attempt', {
                p_response_id: responseId,
                p_block_id: blockId,
                p_idempotency_key: idempotencyKey
              });
            },
            hitRateLimit: async (responseId: string) => {
              return supabaseAdmin.rpc('hit_public_rate_limit', {
                p_key_hash: String(responseId),
                p_action: 'camera_ai_verify',
                p_window_seconds: 600,
                p_limit: 10
              });
            },
            analyzeImage: async (question: string, buffer: ArrayBuffer, mimeType: string) => {
              return analyzeImage(openai, model, question, buffer, mimeType);
            },
            markFailed: async ({ responseId, blockId, idempotencyKey, code }: { responseId: string; blockId: string; idempotencyKey: string; code: string }) => {
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
