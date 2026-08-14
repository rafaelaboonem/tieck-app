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
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');
              return client.rpc('resolve_public_response', { p_token: token });
            },
            claimAttempt: async ({ responseId, blockId, idempotencyKey }: { responseId: string; blockId: string; idempotencyKey: string }) => {
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');
              return client.rpc('claim_camera_ai_attempt', {
                p_response_id: responseId,
                p_block_id: blockId,
                p_idempotency_key: idempotencyKey
              });
            },
            attachEvidence: async ({ responseId, blockId, idempotencyKey, evidenceId }) => {
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');
              return client.rpc('attach_camera_ai_evidence', {
                p_response_id: responseId,
                p_block_id: blockId,
                p_idempotency_key: idempotencyKey,
                p_evidence_id: evidenceId
              });
            },
            persistEvidence: async ({ checklistId, responseId, blockId, idempotencyKey, buffer, mimeType }) => {
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');

              const ext = mimeType.split('/')[1] || 'jpg';
              const storagePath = `${checklistId}/${responseId}/${blockId}/${idempotencyKey}.${ext}`;
              
              try {
                const uint8Array = new Uint8Array(buffer);
                
                // 1. Check if object already exists in Storage
                const { data: existingList } = await client.storage
                  .from('checklist-evidences')
                  .list(storagePath.substring(0, storagePath.lastIndexOf('/')), {
                    search: storagePath.split('/').pop()
                  });
                
                const alreadyInStorage = existingList && existingList.length > 0;

                if (!alreadyInStorage) {
                  // Upload only if NOT present
                  const { error: uploadError } = await client.storage
                    .from('checklist-evidences')
                    .upload(storagePath, uint8Array, {
                      contentType: mimeType,
                      upsert: false // Security: do not overwrite silently
                    });

                  if (uploadError) {
                    // If 409, it might have been created by concurrent request
                    if ((uploadError as any).status !== 409) {
                      console.error(`[CameraAI] Storage upload failed:`, uploadError);
                      return { evidenceId: null, error: uploadError };
                    }
                  }
                }

                // 2. Database Record (idempotent via storage_path UNIQUE)
                const { data: evidence, error: dbError } = await client
                  .from('checklist_evidences')
                  .upsert({
                    checklist_id: checklistId,
                    response_id: responseId,
                    block_id: blockId,
                    storage_path: storagePath,
                    mime_type: mimeType,
                    size_bytes: uint8Array.byteLength,
                    source: 'camera_ai_openai',
                    origin_bucket: 'checklist-evidences',
                    uploaded: true
                  }, { onConflict: 'storage_path' })
                  .select('id')
                  .single();

                if (dbError) {
                  console.error(`[CameraAI] Evidence DB record failed:`, dbError);
                  // ONLY cleanup if we were the ones who successfully uploaded it just now
                  // This is hard to guarantee 100% without more complex state, 
                  // but we avoid deleting if alreadyInStorage was true.
                  if (!alreadyInStorage) {
                    await client.storage.from('checklist-evidences').remove([storagePath]);
                  }
                  return { evidenceId: null, error: dbError };
                }

                return { evidenceId: evidence.id, error: null };
              } catch (e) {
                console.error(`[CameraAI] Persistence exception:`, e);
                return { evidenceId: null, error: e };
              }
            },
            hitRateLimit: async (responseId: string) => {
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');
              return client.rpc('hit_public_rate_limit', {
                p_key_hash: String(responseId),
                p_action: 'camera_ai_verify',
                p_window_seconds: 600,
                p_limit: 10
              });
            },
            analyzeImage: async (question: string, buffer: ArrayBuffer, mimeType: string) => {
              const openaiClient = new OpenAI({ apiKey });
              return analyzeImage(openaiClient, model, question, buffer, mimeType);
            },
            markFailed: async ({ responseId, blockId, idempotencyKey, code }: { responseId: string; blockId: string; idempotencyKey: string; code: string }) => {
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');
              return client
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
              const client = createServerSupabaseClient();
              if (!client) throw new Error('Supabase client failed');
              return client
                .from('camera_ai_attempts')
                .update({
                  status: 'completed',
                  decision: params.decision,
                  code: params.code,
                  evidence: params.evidence,
                  evidence_id: params.evidenceId,
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
