import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { CameraVerificationPolicyV1Schema, PublishedBlock } from '@/server/camera-ai/schema';
import { analyzeImage } from '@/server/camera-ai/openai-provider';
import { evaluateGate } from '@/server/camera-ai/gate';
import { validateImageBuffer } from '@/server/camera-ai/image-validation';
import { createHash } from 'crypto';
import OpenAI from 'openai';

const TestPayloadSchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string().min(1).max(128),
});

function isPublishedBlock(b: unknown): b is PublishedBlock {
  return b !== null && typeof b === 'object' && 'type' in b && (b as any).type === 'camera';
}

export const Route = createFileRoute('/api/camera-ai/test-verification')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env['CAMERA_AI_MODE'] !== 'enabled') {
          return Response.json({ ok: false, code: 'camera_ai_disabled' }, { status: 503 });
        }

        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey) return Response.json({ ok: false, code: 'config_missing' }, { status: 503 });

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const client = createServerSupabaseClient();
        if (!client) return Response.json({ ok: false, code: 'config_missing' }, { status: 503 });

        const { data: { user } } = await client.auth.getUser(token);
        if (!user) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });

        try {
          let formData: FormData;
          try {
            formData = await request.formData();
          } catch (e) {
            return Response.json({ ok: false, code: 'invalid_form_data', error: String(e) }, { status: 400 });
          }

          const validation = TestPayloadSchema.safeParse({
            checklistId: formData.get('checklistId'),
            blockId: formData.get('blockId'),
          });
          if (!validation.success) return Response.json({ ok: false, code: 'invalid_payload', errors: validation.error.format() }, { status: 400 });
          
          const { checklistId, blockId } = validation.data;
          const candidate = formData.get('candidate');
          if (!candidate) return Response.json({ ok: false, code: 'missing_image' }, { status: 400 });
          
          // Use duck typing and type assertion to handle FormDataEntryValue correctly
          const isBlob = candidate && typeof (candidate as any).arrayBuffer === 'function';
          if (!isBlob) {
            return Response.json({ ok: false, code: 'invalid_image_type', type: typeof candidate }, { status: 400 });
          }

          const blobCandidate = candidate as unknown as Blob;

          const { data: checklist, error: chkError } = await client
            .from('checklists')
            .select('blocks, workspace_id, user_id')
            .eq('id', checklistId)
            .single();

          if (chkError || !checklist) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
          
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
          if (!isAuthorized) return Response.json({ ok: false, code: 'forbidden' }, { status: 403 });

          const blocks = Array.isArray(checklist.blocks) ? checklist.blocks : [];
          const block = blocks.find((b: unknown) => isPublishedBlock(b) && (b as any).id === blockId);
          if (!block || !isPublishedBlock(block)) return Response.json({ ok: false, code: 'invalid_block' }, { status: 404 });

          const policy = (block as any).cameraAiPolicy;
          const policyValidation = CameraVerificationPolicyV1Schema.safeParse(policy);
          if (!policyValidation.success) return Response.json({ ok: false, code: 'invalid_policy' }, { status: 400 });

          const question = (String((block as any).title || '') + ' ' + String((block as any).description || '')).trim();
          const expectedHash = createHash('sha256').update(question).digest('hex');
          if (policyValidation.data.questionHash !== expectedHash) {
             return Response.json({ ok: false, code: 'checklist_update_required' }, { status: 400 });
          }

          const buffer = await blobCandidate.arrayBuffer();
          const imgVal = await validateImageBuffer(buffer, blobCandidate.type);
          if (!imgVal.valid) return Response.json({ ok: false, code: imgVal.code || 'invalid_image' }, { status: 400 });

          const openaiClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
          const analysis = await analyzeImage(openaiClient, process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini', question, buffer, imgVal.mimeType || 'image/jpeg', 20000, policyValidation.data);
          const result = evaluateGate(analysis);

          return Response.json({ ...result, requestId: Math.random().toString(36).substring(7) });
        } catch (error) {
          console.error('[CameraAI-Test] Technical failure:', error);
          const message = error instanceof Error ? error.message : 'Unknown';
          return Response.json({ ok: false, code: 'technical_failure', debug: message }, { status: 500 });
        }
      }
    }
  }
});
