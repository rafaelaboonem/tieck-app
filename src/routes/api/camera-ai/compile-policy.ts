import { createFileRoute } from '@tanstack/react-router';
import { CompilePolicyPayloadSchema, CameraVerificationPolicyV1Schema, PolicyGenerationSchema, CameraVerificationPolicyV1, PublishedBlock } from '@/server/camera-ai/schema';
import OpenAI from 'openai';
import { zodTextFormat } from "openai/helpers/zod";
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { createHash } from 'crypto';

const POLICY_GENERATION_PROMPT = `Você é um analista de critérios de verificação visual para o sistema Tieck.
Sua tarefa é ler uma pergunta de auditoria e extrair uma política estruturada para que uma IA de visão valide uma foto.

DIRETRIZES:
1. VERIFICABILIDADE: 
   - "visual": A pergunta pode ser 100% comprovada por uma foto.
   - "partially_visual": A foto prova parte, mas pode precisar de contexto.
   - "not_visual": A pergunta é subjetiva ou invisível.
2. TARGET: O objeto principal a ser observado.
3. CONDITION: O estado esperado do objeto.
4. TARGET DESCRIPTION: Descrição física detalhada do objeto solicitado.
5. CONDITION DESCRIPTION: Descrição técnica do que constitui o cumprimento da condição.
6. REQUIRED VISIBLE EVIDENCE: Lista de elementos que DEVEM aparecer na foto.
7. REJECTION SIGNALS: Sinais visuais claros de que a condição NÃO foi atendida ou o objeto é incorreto.
8. NOT OBSERVABLE SIGNALS: O que impediria a verificação (ex: reflexo, sombra, corte).
9. SUMMARY: Um resumo de uma frase para o usuário final.
10. Mantenha os textos curtos e em português brasileiro.`;

export const Route = createFileRoute('/api/camera-ai/compile-policy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env['OPENAI_API_KEY'];
        const supabaseUrl = process.env['SUPABASE_URL'];
        const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
          return Response.json({ ok: false, code: 'config_missing' }, { status: 503 });
        }

        try {
          const body = await request.json();
          const validation = CompilePolicyPayloadSchema.safeParse(body);
          if (!validation.success) {
            console.error('[CompilePolicy] Payload validation failed:', validation.error);
            return Response.json({ ok: false, code: 'invalid_payload' }, { status: 400 });
          }

          const { checklistId, blockId } = validation.data;
          const client = createServerSupabaseClient();
          if (!client) throw new Error('Supabase client failed');

          const authHeader = request.headers.get('Authorization');
          if (!authHeader) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });
          
          const { data: { user }, error: authError } = await client.auth.getUser(authHeader.replace('Bearer ', ''));
          if (authError || !user) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });

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
              .maybeSingle();
            
            if (member && member.status === 'active' && (member.role === 'admin' || member.role === 'editor' || member.role === 'owner')) {
              isAuthorized = true;
            }
          }

          if (!isAuthorized) {
            return Response.json({ ok: false, code: 'forbidden' }, { status: 403 });
          }
          
          const blocks = checklist.blocks;
          if (!Array.isArray(blocks)) {
            return Response.json({ ok: false, code: 'invalid_checklist_format' }, { status: 400 });
          }

          const block = blocks.find((b: unknown): b is PublishedBlock => 
            b !== null && 
            typeof b === 'object' && 
            'id' in b && 
            b.id === blockId &&
            'type' in b &&
            b.type === 'camera'
          );

          if (!block) {
            return Response.json({ ok: false, code: 'invalid_block' }, { status: 400 });
          }

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();
          if (!question) {
            return Response.json({ ok: false, code: 'empty_question' }, { status: 400 });
          }

          const questionHash = createHash('sha256').update(question).digest('hex');

          if (block.cameraAiPolicy) {
            const cachedPolicyResult = CameraVerificationPolicyV1Schema.safeParse(block.cameraAiPolicy);
            if (cachedPolicyResult.success) {
              const cached = cachedPolicyResult.data;
              if (cached.version === 1 && cached.questionHash === questionHash) {
                return Response.json({ ok: true, policy: cached });
              }
            }
          }

          const openai = new OpenAI({ apiKey });
          const response = await openai.responses.parse({
            model: "gpt-4o-mini",
            input: [
              { role: "system", content: POLICY_GENERATION_PROMPT },
              { role: "user", content: `PERGUNTA: "${question}"` }
            ],
            text: {
              format: zodTextFormat(PolicyGenerationSchema, "camera_verification_policy")
            }
          });

          const generated = response.output_parsed;
          if (!generated) throw new Error('OpenAI parse failed');

          const finalPolicyData: CameraVerificationPolicyV1 = {
            ...generated,
            version: 1,
            questionHash,
            source: 'generated',
          };

          const finalValidation = CameraVerificationPolicyV1Schema.safeParse(finalPolicyData);
          if (!finalValidation.success) {
            console.error('[CompilePolicy] Final validation failed');
            throw new Error('Generated policy failed final validation');
          }

          return Response.json({ ok: true, policy: finalValidation.data });

        } catch (error: unknown) {
          console.error('[CompilePolicy] Technical failure occurred');
          return Response.json({ ok: false, code: 'technical_failure' }, { status: 500 });
        }
      }
    }
  }
});