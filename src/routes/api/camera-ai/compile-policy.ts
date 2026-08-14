import { createFileRoute } from '@tanstack/react-router';
import { CompilePolicyPayloadSchema, CameraVerificationPolicyV1Schema } from '@/server/camera-ai/schema';
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { createHash } from 'crypto';

const POLICY_GENERATION_PROMPT = `Você é um analista de critérios de verificação visual para o sistema Tieck.
Sua tarefa é ler uma pergunta de auditoria e extrair uma política estruturada para que uma IA de visão valide uma foto.

DIRETRIZES:
1. VERIFICABILIDADE: 
   - "visual": A pergunta pode ser 100% comprovada por uma foto (ex: "A pia está limpa?").
   - "partially_visual": A foto prova parte, mas pode precisar de contexto (ex: "O estoque está organizado?").
   - "not_visual": A pergunta é subjetiva ou invisível (ex: "O cliente foi bem atendido?").
2. TARGET: O objeto principal a ser observado.
3. CONDITION: O estado esperado do objeto.
4. REQUIRED EVIDENCE: O que DEVE aparecer na foto para ser válida.
5. REJECTION SIGNALS: O que invalida a foto imediatamente.
6. SUMMARY: Um resumo de uma frase para o usuário final sobre o que será verificado.
7. Mantenha os textos curtos, objetivos e em português brasileiro.
8. Máximo de 5 itens por lista.`;

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
            return Response.json({ ok: false, code: 'invalid_payload' }, { status: 400 });
          }

          const { checklistId, blockId } = validation.data;
          const client = createServerSupabaseClient();
          if (!client) throw new Error('Supabase client failed');

          // 1. Get current user from auth header
          const authHeader = request.headers.get('Authorization');
          if (!authHeader) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });
          
          const { data: { user }, error: authError } = await client.auth.getUser(authHeader.replace('Bearer ', ''));
          if (authError || !user) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });

          // 2. Fetch checklist and verify ownership/access
          const { data: checklist, error: chkError } = await client
            .from('checklists')
            .select('blocks, workspace_id')
            .eq('id', checklistId)
            .single();

          if (chkError || !checklist) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
          
          // Basic ownership check (extend to workspace roles if needed)
          // For now, check if user is in workspace or is the owner (if workspace_id is null)
          // Simplified for Phase 1:
          // const { data: workspace } = await client.from('workspaces').select('id').eq('id', checklist.workspace_id).single();
          
          const blocks = checklist.blocks as any[];
          const block = blocks.find(b => b.id === blockId);
          if (!block || block.type !== 'camera') {
            return Response.json({ ok: false, code: 'invalid_block' }, { status: 400 });
          }

          const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();
          if (!question) {
            return Response.json({ ok: false, code: 'empty_question' }, { status: 400 });
          }

          const questionHash = createHash('sha256').update(question).digest('hex');

          // 3. Cache Check
          if (block.cameraAiPolicy?.questionHash === questionHash && block.cameraAiPolicy?.version === 1) {
            return Response.json({ ok: true, policy: block.cameraAiPolicy });
          }

          // 4. OpenAI Generation
          const openai = new OpenAI({ apiKey });
          const response = await openai.responses.parse({
            model: "gpt-4o-mini",
            input: [
              { role: "system", content: POLICY_GENERATION_PROMPT },
              { role: "user", content: `PERGUNTA: "${question}"` }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "camera_verification_policy",
                strict: true,
                schema: zodResponseFormat(CameraVerificationPolicyV1Schema, "camera_verification_policy").json_schema.schema
              }
            }
          } as any);

          const policy = response.choices[0].message.parsed;
          if (!policy) throw new Error('OpenAI parse failed');

          // Inject version and hash
          const finalPolicy = {
            ...policy,
            version: 1,
            questionHash,
            source: 'generated'
          };

          return Response.json({ ok: true, policy: finalPolicy });

        } catch (error: any) {
          console.error('[CompilePolicy] Failed:', error);
          return Response.json({ ok: false, code: 'technical_failure', message: error.message }, { status: 500 });
        }
      }
    }
  }
});