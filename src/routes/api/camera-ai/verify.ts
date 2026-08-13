import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

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

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        
        // Return 503 if disabled
        if (mode === 'disabled') {
          return Response.json({ 
            ok: false, 
            code: 'camera_ai_disabled', 
            message: 'Verificação visual ainda não ativada.' 
          }, { status: 503 });
        }

        // Validate basic JSON structure
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

        // Fail closed for now
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
