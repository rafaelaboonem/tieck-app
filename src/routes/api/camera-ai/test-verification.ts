import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { CameraVerificationPolicyV1Schema, PublishedBlock, VerificationResult } from '@/server/camera-ai/schema';
import { analyzeImage } from '@/server/camera-ai/openai-provider';
import { evaluateGate } from '@/server/camera-ai/gate';
import { validateImageBuffer } from '@/server/camera-ai/image-validation';
import { createHash, randomUUID } from 'crypto';

const TestPayloadSchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string().min(1).max(128),
});

/** Safe type guard for objects */
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Type guard for Camera published blocks */
function isCameraBlock(b: unknown): b is PublishedBlock {
  return isRecord(b) && b.type === 'camera' && typeof b.id === 'string';
}

export const Route = createFileRoute('/api/camera-ai/test-verification')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = randomUUID();
        
        if (process.env['CAMERA_AI_MODE'] !== 'enabled') {
          return Response.json({ ok: false, code: 'camera_ai_disabled', requestId } as VerificationResult, { status: 503 });
        }

        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey) {
          console.error(`[CameraAI-Test] [${requestId}] Configuration missing: OPENAI_API_KEY`);
          return Response.json({ ok: false, code: 'config_missing', requestId } as VerificationResult, { status: 503 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return Response.json({ ok: false, code: 'unauthorized', requestId } as VerificationResult, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const client = createServerSupabaseClient();
        if (!client) {
          console.error(`[CameraAI-Test] [${requestId}] Supabase client failure`);
          return Response.json({ ok: false, code: 'config_missing', requestId } as VerificationResult, { status: 503 });
        }

        const { data: { user } } = await client.auth.getUser(token);
        if (!user) return Response.json({ ok: false, code: 'unauthorized', requestId } as VerificationResult, { status: 401 });

        try {
          let formData: FormData;
          try {
            formData = await request.formData();
          } catch (e) {
            return Response.json({ ok: false, code: 'invalid_form_data', requestId } as VerificationResult, { status: 400 });
          }

          const validation = TestPayloadSchema.safeParse({
            checklistId: formData.get('checklistId'),
            blockId: formData.get('blockId'),
          });
          
          if (!validation.success) {
            return Response.json({ ok: false, code: 'invalid_payload', requestId } as VerificationResult, { status: 400 });
          }
          
          const { checklistId, blockId } = validation.data;
          const candidate = formData.get('candidate');
          
          if (!candidate) return Response.json({ ok: false, code: 'missing_image', requestId } as VerificationResult, { status: 400 });
          
          // Type-safe Blob detection
          const isBlob = candidate && typeof candidate === 'object' && 'arrayBuffer' in candidate && typeof (candidate as any).arrayBuffer === 'function';
          if (!isBlob) {
            return Response.json({ ok: false, code: 'invalid_image_type', requestId } as VerificationResult, { status: 400 });
          }

          const blobCandidate = candidate as unknown as Blob;

          const { data: checklist, error: chkError } = await client
            .from('checklists')
            .select('blocks, workspace_id, user_id')
            .eq('id', checklistId)
            .single();

          if (chkError || !checklist) return Response.json({ ok: false, code: 'not_found', requestId } as VerificationResult, { status: 404 });
          
          let isAuthorized = checklist.user_id === user.id;
          if (!isAuthorized && checklist.workspace_id) {
            const { data: member } = await client
              .from('workspace_members')
              .select('status, role')
              .eq('workspace_id', checklist.workspace_id)
              .eq('user_id', user.id)
              .eq('status', 'active')
              .maybeSingle();
            
            if (member && (member.role === 'admin' || member.role === 'editor' || member.role === 'owner')) {
              isAuthorized = true;
            }
          }
          if (!isAuthorized) return Response.json({ ok: false, code: 'forbidden', requestId } as VerificationResult, { status: 403 });

          const blocks = Array.isArray(checklist.blocks) ? checklist.blocks : [];
          const block = blocks.find((b: unknown) => isCameraBlock(b) && b.id === blockId);
          if (!block || !isCameraBlock(block)) return Response.json({ ok: false, code: 'invalid_block', requestId } as VerificationResult, { status: 404 });

          const policy = block.cameraAiPolicy;
          const policyValidation = CameraVerificationPolicyV1Schema.safeParse(policy);
          if (!policyValidation.success) return Response.json({ ok: false, code: 'invalid_policy', requestId } as VerificationResult, { status: 400 });

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();
          const expectedHash = createHash('sha256').update(question).digest('hex');
          if (policyValidation.data.questionHash !== expectedHash) {
             return Response.json({ ok: false, code: 'checklist_update_required', requestId } as VerificationResult, { status: 400 });
          }

          const buffer = await blobCandidate.arrayBuffer();
          const imgVal = await validateImageBuffer(buffer, blobCandidate.type);
          if (!imgVal.valid) return Response.json({ ok: false, code: imgVal.code || 'invalid_image', requestId } as VerificationResult, { status: 400 });

          // 1. Rate Limit
          const keyHash = createHash('sha256').update(user.id + ":" + checklistId).digest('hex');
          const { data: limitOk, error: limitErr } = await client.rpc('hit_public_rate_limit', {
            p_key_hash: keyHash,
            p_action: 'camera_ai_test',
            p_window_seconds: 600,
            p_limit: 10
          });

          if (limitErr || !limitOk) {
            console.log(`[CameraAI-Test] [${requestId}] Rate limit reached or failed`, { limitErr });
            return Response.json({ ok: false, code: 'rate_limit', requestId } as VerificationResult, { status: 429 });
          }

          const { OpenAI } = await import('openai');
          const openaiClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: process.env.NODE_ENV === 'test' });

          const analysis = await analyzeImage(
            openaiClient, 
            process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini', 
            question, 
            buffer, 
            imgVal.mimeType || 'image/jpeg', 
            20000, 
            policyValidation.data
          );
          
          const result = evaluateGate(analysis);

          return Response.json({ ...result, requestId });
        } catch (error: unknown) {
          console.error(`[CameraAI-Test] [${requestId}] Failure:`, error);
          return Response.json({ ok: false, code: 'technical_failure', requestId } as VerificationResult, { status: 500 });
        }
      }
    }
  }
});
