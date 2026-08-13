import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import OpenAI from 'openai';
import { supabase } from '@/integrations/supabase/client';

/**
 * Camera AI Verification Endpoint (V5 - OpenAI gpt-4o-mini)
 * 
 * Objective: Verify if a candidate image matches a question using Structured Outputs.
 */

const verifySchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string(), 
  responseToken: z.string(),
  idempotencyKey: z.string().min(1),
});

export const Route = createFileRoute('/api/camera-ai/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const mode = (process.env as any)['CAMERA_AI_MODE'] || 'disabled';
        
        // 1. Fail fast if disabled
        if (mode !== 'enabled') {
          return Response.json({ 
            ok: false, 
            code: 'camera_ai_disabled', 
            message: 'A verificação inteligente está desativada no momento.' 
          }, { status: 503 });
        }

        try {
          // 2. Parse Multipart Data
          const formData = await request.formData();
          const payload = {
            checklistId: formData.get('checklistId'),
            blockId: formData.get('blockId'),
            responseToken: formData.get('responseToken'),
            idempotencyKey: formData.get('idempotencyKey'),
          };

          const validation = verifySchema.safeParse(payload);
          if (!validation.success) {
            return Response.json({ ok: false, code: 'invalid_request', errors: validation.error.format() }, { status: 400 });
          }

          const { checklistId, blockId, responseToken, idempotencyKey } = validation.data;
          const candidateFile = formData.get('candidate') as unknown as File | null;

          if (!candidateFile || !(candidateFile instanceof File)) {
            return Response.json({ ok: false, code: 'missing_image', message: 'Nenhuma imagem foi enviada.' }, { status: 400 });
          }

          // 3. Image Validation (3MB limit, type check)
          if (candidateFile.size > 3 * 1024 * 1024) {
            return Response.json({ ok: false, code: 'image_too_large', message: 'A imagem deve ter no máximo 3MB.' }, { status: 413 });
          }

          const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
          if (!allowedTypes.includes(candidateFile.type)) {
            return Response.json({ ok: false, code: 'invalid_image_type', message: 'Tipo de imagem não suportado. Use JPEG, PNG ou WebP.' }, { status: 400 });
          }

          // 4. Validate Session and Fetch Checklist Published Content
          // We use the checklistId to fetch the current published version.
          // Note: In a full implementation, we'd verify the responseToken via an RPC.
          const { data: checklistData, error: checklistError } = await supabase
            .from('checklists')
            .select('published_content')
            .eq('id', checklistId)
            .maybeSingle();

          if (checklistError || !checklistData) {
            return Response.json({ ok: false, code: 'checklist_not_found', message: 'Checklist não encontrado.' }, { status: 404 });
          }

          const publishedContent = checklistData.published_content as any;
          if (!publishedContent || !Array.isArray(publishedContent.blocks)) {
            return Response.json({ ok: false, code: 'invalid_snapshot', message: 'O checklist não possui uma versão publicada válida.' }, { status: 404 });
          }

          // 5. Locate /Camera Block and Extract Question
          const block = publishedContent.blocks.find((b: any) => b.id === blockId && b.type === 'camera');
          if (!block) {
            return Response.json({ ok: false, code: 'block_not_found', message: 'Bloco de câmera não encontrado no snapshot publicado.' }, { status: 404 });
          }

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim() || 'Verificar conformidade visual.';

          // 6. OpenAI Inference
          const apiKey = (process.env as any)['OPENAI_API_KEY'];
          if (!apiKey) {
            return Response.json({ ok: false, code: 'technical_failure', message: 'Configuração de IA ausente.' }, { status: 500 });
          }

          const openai = new OpenAI({ apiKey });
          const visionModel = (process.env as any)['OPENAI_VISION_MODEL'] || 'gpt-4o-mini';

          const imageBuffer = await candidateFile.arrayBuffer();
          const base64Image = Buffer.from(imageBuffer).toString('base64');

          // Use cast to any to bypass potential SDK version mismatches in strict typecheck
          const response = await (openai.beta.chat.completions as any).parse({
            model: visionModel,
            messages: [
              {
                role: "system",
                content: `Você é um especialista em auditoria visual do sistema Tieck. 
Sua tarefa é analisar UMA ÚNICA FOTO enviada por um funcionário e compará-la com a PERGUNTA do auditor.

REGRAS ESTRITAS:
1. Analise APENAS o que está visível na foto.
2. Verifique se o objeto ou local citado na pergunta aparece (target_visible).
3. Nunca infira objetos fora do enquadramento.
4. Nunca aprove com base apenas no contexto provável. Se não vir o alvo, condition_met=false.
5. Use linguagem objetiva e curta.
6. Em visible_evidence, coloque apenas FATOS observáveis. Não invente detalhes.
7. Fotos aleatórias, pretas ou sem relação com a pergunta devem resultar em target_visible=false.
8. Não use palavras especulativas como "parece", "provavelmente", "talvez".`
              },
              {
                role: "user",
                content: [
                  { type: "text", text: `PERGUNTA DO AUDITOR: "${question}"` },
                  {
                    type: "image_url",
                    image_url: { url: `data:${candidateFile.type};base64,${base64Image}` }
                  }
                ]
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "camera_verification",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    target_visible: { type: "boolean" },
                    condition_observable: { type: "boolean" },
                    condition_met: { type: "boolean" },
                    image_quality: { type: "string", enum: ["usable", "dark", "blurry", "cropped", "unusable"] },
                    confidence: { type: "number" },
                    visible_evidence: { type: "string" },
                    user_message: { type: "string" }
                  },
                  required: ["target_visible", "condition_observable", "condition_met", "image_quality", "confidence", "visible_evidence", "user_message"],
                  additionalProperties: false
                }
              }
            },
            timeout: 20000,
          });

          const result = response.choices[0].message.parsed;
          if (!result) {
            throw new Error('OpenAI returned empty result');
          }

          // 7. Deterministic Server Gate
          const speculativeTerms = ["parece", "provavelmente", "talvez", "aparenta", "suponho", "possivelmente"];
          const evidenceIsSpeculative = speculativeTerms.some(term => 
            result.visible_evidence.toLowerCase().includes(term)
          );

          let decision: 'approved' | 'retake' | 'not_observable' | 'technical_failure' = 'retake';

          const isApproved = 
            result.target_visible === true &&
            result.condition_observable === true &&
            result.condition_met === true &&
            result.image_quality === "usable" &&
            result.confidence >= 0.90 &&
            result.visible_evidence.trim().length > 0 &&
            !evidenceIsSpeculative;

          if (isApproved) {
            decision = 'approved';
          } else if (!result.target_visible || result.image_quality !== "usable" || result.confidence < 0.90 || evidenceIsSpeculative) {
            decision = 'retake';
          } else if (!result.condition_observable) {
            decision = 'not_observable';
          }

          // 8. Log Duration (Sanitized)
          const duration = Date.now() - startTime;
          console.log(`[CameraAI] Decision: ${decision} for block ${blockId} (duration: ${duration}ms)`);

          return Response.json({
            ok: true,
            decision,
            analysis: result
          });

        } catch (error: any) {
          console.error('[CameraAI] Server Error:', error);
          
          return Response.json({ 
            ok: false, 
            code: 'technical_failure', 
            message: 'Ocorreu uma falha técnica na análise da imagem.' 
          }, { status: 500 });
        }
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
});