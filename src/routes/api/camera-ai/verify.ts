import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

/**
 * Camera AI Verification Endpoint (V5) - NEUTRAL BASELINE
 * 
 * Objective: Safety endpoint for visual verification.
 * This implementation is FAILING CLOSED and respects CAMERA_AI_MODE.
 * NO OpenAI SDK instantiation, NO inference.
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
        
        // Ensure application/json header
        const headers = { 'Content-Type': 'application/json' };

        // 1. Check if disabled (503)
        if (mode !== 'enabled') {
          return new Response(JSON.stringify({ 
            ok: false, 
            code: 'camera_ai_disabled', 
            message: 'Verificação visual ainda não ativada.' 
          }), { status: 503, headers });
        }

        // 2. Validate basic JSON structure
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ 
            ok: false, 
            code: 'bad_request', 
            message: 'Invalid JSON' 
          }), { status: 400, headers });
        }

        const result = verifySchema.safeParse(body);
        if (!result.success) {
          return new Response(JSON.stringify({ 
            ok: false, 
            code: 'bad_request', 
            message: 'Invalid parameters', 
            details: result.error.format() 
          }), { status: 400, headers });
        }

        // 3. Return 501 (Not Implemented) as we are in neutral baseline phase
        return new Response(JSON.stringify({ 
          ok: false, 
          code: 'not_implemented', 
          message: 'Processamento real ainda não ativado nesta fase.' 
        }), { status: 501, headers });
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
      },
      GET: async () => methodNotAllowed(),
      PUT: async () => methodNotAllowed(),
      PATCH: async () => methodNotAllowed(),
      DELETE: async () => methodNotAllowed(),
    }
  }
})

function methodNotAllowed() {
  return new Response(JSON.stringify({
    ok: false,
    code: 'method_not_allowed',
    message: 'Método não permitido.'
  }), { 
    status: 405, 
    headers: { 'Content-Type': 'application/json' } 
  });
}
