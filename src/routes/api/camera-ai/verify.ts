import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

/**
 * Camera AI Verification Endpoint (V5)
 * 
 * Objective: Verify if a candidate image matches a question using GPT-4o-mini Structured Outputs.
 * This implementation is FAILING CLOSED and respects CAMERA_AI_MODE=disabled.
 */

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = process.env['CAMERA_AI_MODE'] || 'disabled';
        
        // Return 503 if disabled
        if (mode !== 'enabled') {
          return Response.json({ 
            ok: false, 
            code: 'camera_ai_disabled', 
            message: 'A verificação inteligente ainda não está disponível.' 
          }, { status: 503 });
        }

        // CAMERA_AI_MODE = enabled, enquanto a IA não estiver implementada → JSON 501
        return Response.json({ 
          ok: false, 
          code: 'camera_ai_not_implemented', 
          message: 'A verificação inteligente ainda não foi implementada.' 
        }, { status: 501 });
      },
      GET: async () => {
        return Response.json({ ok: false, code: 'method_not_allowed', message: 'Method Not Allowed' }, { status: 405 });
      },
      PUT: async () => {
        return Response.json({ ok: false, code: 'method_not_allowed', message: 'Method Not Allowed' }, { status: 405 });
      },
      DELETE: async () => {
        return Response.json({ ok: false, code: 'method_not_allowed', message: 'Method Not Allowed' }, { status: 405 });
      },
      PATCH: async () => {
        return Response.json({ ok: false, code: 'method_not_allowed', message: 'Method Not Allowed' }, { status: 405 });
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
