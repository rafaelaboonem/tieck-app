import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

/**
 * Camera AI Verification Endpoint (V5)
 * 
 * Objective: Verify if a candidate image matches a question using GPT-4o-mini Structured Outputs.
 * This implementation is FAILING CLOSED and respects CAMERA_AI_MODE=disabled.
 */

const verifySchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string(),
  responseToken: z.string(),
  evidenceId: z.string(),
  idempotencyKey: z.string().optional(),
})

type OpenAIResponse = {
  target_present: boolean
  condition_observable: boolean
  condition_met: boolean
  image_quality_usable: boolean
  confidence: number
  visible_evidence: string
  model_decision: 'approved' | 'retake' | 'not_observable'
}

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        
        // 1. Basic security & parsing
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return Response.json({ ok: false, code: 'bad_request', message: 'Invalid JSON' }, { status: 400 });
        }

        const result = verifySchema.safeParse(body);
        if (!result.success) {
          return Response.json({ ok: false, code: 'bad_request', message: 'Invalid parameters', details: result.error.format() }, { status: 400 });
        }

        const { checklistId, blockId, responseToken, evidenceId } = result.data;

        // 2. Disabled check (Baseline Neutra)
        if (mode === 'disabled') {
          return Response.json({ 
            ok: false, 
            code: 'camera_ai_disabled', 
            message: 'Verificação visual ainda não ativada.' 
          }, { status: 503 });
        }

        // 3. Validation Logic (Future implementation)
        // Here we would fetch published_content from Supabase using checklistId
        // and verify responseToken.
        
        return Response.json({ 
          ok: false, 
          code: 'not_implemented', 
          message: 'Processamento real ainda não ativado nesta fase.' 
        }, { status: 501 });
      },
      OPTIONS: async () => {
        return new Response(null, { 
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        });
      }
    }
  }
})
