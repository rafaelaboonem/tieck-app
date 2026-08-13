import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';

        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ 
            error: 'invalid_json',
            message: 'Requisição inválida' 
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const schema = z.object({
          checklistId: z.string().uuid(),
          blockId: z.string(),
          responseToken: z.string(),
          evidenceId: z.string(),
          idempotencyKey: z.string().optional(),
        });

        const result = schema.safeParse(body);
        if (!result.success) {
          return new Response(JSON.stringify({ 
            error: 'bad_request',
            message: 'Parâmetros inválidos',
            details: result.error.format()
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (mode === 'disabled') {
          return new Response(JSON.stringify({ 
            error: 'camera_ai_disabled',
            message: 'A verificação inteligente ainda não está ativada.' 
          }), { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ 
          error: 'not_implemented',
          message: 'Endpoint em construção.' 
        }), { 
          status: 501,
          headers: { 'Content-Type': 'application/json' }
        });
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
