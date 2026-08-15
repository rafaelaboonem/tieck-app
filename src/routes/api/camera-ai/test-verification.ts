import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { CameraVerificationPolicyV1Schema } from '@/server/camera-ai/schema';
import { analyzeImage } from '@/server/camera-ai/openai-provider';
import { evaluateGate } from '@/server/camera-ai/gate';
import { validateImageBuffer } from '@/server/camera-ai/image-validation';
import { createHash } from 'crypto';
import OpenAI from 'openai';

const TestPayloadSchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string().uuid(),
});

export const Route = createFileRoute('/api/camera-ai/test-verification')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const client = createServerSupabaseClient();
        if (!client) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });

        const { data: { user } } = await client.auth.getUser();
        if (!user) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });

        try {
          const formData = await request.formData();
          const validation = TestPayloadSchema.safeParse({
            checklistId: formData.get('checklistId'),
            blockId: formData.get('blockId'),
          });

          if (!validation.success) {
            return Response.json({ ok: false, code: 'invalid_payload' }, { status: 400 });
          }

          const { checklistId, blockId } = validation.data;
          const candidate = formData.get('candidate');

          if (!candidate || !(candidate instanceof File)) {
            return Response.json({ ok: false, code: 'missing_image' }, { status: 400 });
          }

          // 1. Authorization check
          const { data: workspaceMembers, error: authError } = await client
            .from('workspace_members')
            .select('role, status, workspace_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .in('role', ['owner', 'admin', 'editor']);

          if (authError || !workspaceMembers || workspaceMembers.length === 0) {
            // Check if user owns the checklist directly (fallback)
            const { data: checklist, error: chkError } = await client
              .from('checklists')
              .select('id')
              .eq('id', checklistId)
              .eq('user_id', user.id)
              .single();

            if (chkError || !checklist) {
              return Response.json({ ok: false, code: 'forbidden' }, { status: 403 });
            }
          }

          // 2. Fetch block and validate
          const { data: block, error: blockError } = await client
            .from('blocks')
            .select('*')
            .eq('id', blockId)
            .eq('checklist_id', checklistId)
            .single();

          if (blockError || !block || block.type !== 'camera') {
            return Response.json({ ok: false, code: 'invalid_block' }, { status: 404 });
          }

          const policy = block.camera_ai_policy;
          const policyValidation = CameraVerificationPolicyV1Schema.safeParse(policy);
          
          if (!policyValidation.success) {
            return Response.json({ ok: false, code: 'invalid_policy' }, { status: 400 });
          }

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();
          const expectedHash = createHash('sha256').update(question).digest('hex');

          if (policyValidation.data.questionHash !== expectedHash) {
             return Response.json({ ok: false, code: 'checklist_update_required' }, { status: 400 });
          }

          // 3. Image validation
          const buffer = await candidate.arrayBuffer();
          const imgVal = await validateImageBuffer(buffer, candidate.type);
          if (!imgVal.valid) {
            return Response.json({ ok: false, code: imgVal.code || 'invalid_image', message: imgVal.message }, { status: 400 });
          }

          // 4. Rate Limit (separate for tests)
          const { data: rateLimit, error: rlError } = await client.rpc('hit_public_rate_limit', {
            p_key_hash: `test_${user.id}`,
            p_action: 'camera_ai_test',
            p_window_seconds: 600,
            p_limit: 20 // Higher limit for tests
          });

          if (rlError || !rateLimit || !rateLimit[0]?.allowed) {
            return Response.json({ ok: false, code: 'rate_limit' }, { status: 429 });
          }

          // 5. AI Analysis (reusing pure logic)
          const apiKey = process.env['OPENAI_API_KEY'];
          const model = process.env['OPENAI_VISION_MODEL'] || 'gpt-4o-mini';
          if (!apiKey) return Response.json({ ok: false, code: 'config_missing' }, { status: 503 });

          const openaiClient = new OpenAI({ apiKey });
          const analysis = await analyzeImage(
            openaiClient,
            model,
            question,
            buffer,
            imgVal.mimeType || 'image/jpeg',
            20000,
            policyValidation.data
          );

          const result = evaluateGate(analysis);

          return Response.json({
            ok: true,
            ...result,
            requestId: Math.random().toString(36).substring(7)
          });

        } catch (error) {
          console.error('[CameraAI-Test] Technical failure:', error);
          return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
        }
      }
    }
  }
});
