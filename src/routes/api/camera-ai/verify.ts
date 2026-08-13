import { createFileRoute } from '@tanstack/react-router';
import { VerifyPayloadSchema } from '@/server/camera-ai/schema';
import { validateImageBuffer } from '@/server/camera-ai/image-validation';
import { analyzeImage } from '@/server/camera-ai/openai-provider';
import { evaluateGate } from '@/server/camera-ai/gate';
import OpenAI from 'openai';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        if (mode !== 'enabled') {
          return Response.json({ ok: false, code: 'camera_ai_disabled', message: 'IA desativada.' }, { status: 503 });
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

          // 2. Authorization & Data Extraction (Public Session)
          // We hash the token to match Supabase response_token_hash
          const { data: sessionData, error: sessionError } = await (supabase as any).rpc('resolve_public_response', {
            p_token: responseToken
          });

          if (sessionError || !sessionData) {
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

          // 4. Rate Limit (Server-side)
          const { data: limitData, error: limitError } = await (supabase as any).rpc('hit_public_rate_limit', {
            p_action: 'camera_ai_verify',
            p_key_hash: session.response_id, // Rate limit per session
            p_limit: 10,
            p_window_seconds: 600
          });

          if (limitError || !limitData || !limitData[0].allowed) {
            return Response.json({ ok: false, code: 'rate_limit', message: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429, headers: { 'Retry-After': '600' } });
          }

          // 5. Idempotency & Concurrency (Database-level)
          const { data: lock, error: lockErr } = await (supabase as any).rpc('acquire_vision_lock', {
            p_operation: `verify:${session.response_id}:${blockId}:${idempotencyKey}`,
            p_ttl_seconds: 60,
            p_user_id: session.visitor_id,
            p_workspace_id: session.workspace_id
          });

          if (lockErr || !lock || !lock[0].acquired) {
            return Response.json({ ok: false, code: 'processing_conflict' }, { status: 409 });
          }

          // 6. OpenAI Inference (Responses API / Structured Outputs)
          const openai = new OpenAI({ apiKey });
          const model = process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini';

          const analysis = await analyzeImage(openai, model, question, buffer, imgVal.mimeType!);

          // 7. Deterministic Gate
          const result = evaluateGate(analysis);

          return Response.json(result);

        } catch (error) {
          // Log sanitizado
          console.error('[CameraAI] Verification failed (sanitized log)');
          return Response.json({ ok: false, code: 'technical_failure', message: 'Falha técnica na análise.' }, { status: 500 });
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 })
    }
  }
});
