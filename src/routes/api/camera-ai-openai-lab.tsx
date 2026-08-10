import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin as supabase } from '@/integrations/supabase/client.server';
import OpenAI from 'openai';
import { z } from 'zod';

const LabAnalysisSchema = z.object({
  schema_version: z.literal("tieck_openai_lab_v1"),
  target_present: z.boolean(),
  same_task_context: z.boolean(),
  condition_observable: z.boolean(),
  condition_met: z.boolean(),
  image_quality_usable: z.boolean(),
  reference_consistency: z.enum(["match", "mismatch", "insufficient"]),
  observed_evidence: z.array(z.string()),
  blocking_reasons: z.array(z.string()),
  capture_instruction: z.string(),
  model_decision: z.enum(["approved", "retake", "not_verifiable"]),
  confidence: z.number().min(0).max(1),
});

export const Route = createFileRoute('/api/camera-ai-openai-lab')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return new Response('Unauthorized', { status: 401 });

        const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authErr || !user) return new Response('Unauthorized', { status: 401 });

        try {
          const body = await request.json();
          const { standardId, candidateBase64 } = body;

          if (!standardId || !candidateBase64) return new Response('Missing parameters', { status: 400 });

          const { data: standard, error: stdErr } = await supabase
            .from('visual_standards')
            .select('*, references:visual_standard_references(*)')
            .eq('id', standardId)
            .single();

          if (stdErr || !standard) return new Response('Standard not found', { status: 404 });

          const refs = (standard.references || []).filter((r: any) => r.position === 1 || r.position === 2);
          if (refs.length !== 2) return new Response('Exactly two references required', { status: 400 });

          const getBase64 = async (path: string) => {
            const { data, error } = await supabase.storage.from('visual-standards').download(path);
            if (error || !data) throw new Error(`Failed to download reference: ${path}`);
            const buffer = await data.arrayBuffer();
            return Buffer.from(buffer).toString('base64');
          };

          const [ref1Base64, ref2Base64] = await Promise.all([
            getBase64(refs.find((r: any) => r.position === 1)!.storage_path),
            getBase64(refs.find((r: any) => r.position === 2)!.storage_path)
          ]);

          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const model = process.env.OPENAI_VISION_MODEL || "gpt-5.6";

          const response = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: `Você é um especialista em verificação visual do Tieck.
Avalie a FOTO CANDIDATA baseando-se na PERGUNTA e nas REFERÊNCIAS APROVADAS.
Regras:
1. Alvo deve estar presente e no contexto correto.
2. A condição solicitada deve ser visualmente comprovada.
3. Use as referências apenas como padrão de comparação.
4. Seja conservador: na dúvida, peça nova foto (retake).`
              },
              {
                role: "user",
                content: [
                  { type: "text", text: `PERGUNTA: ${standard.question}` },
                  { type: "text", text: "REFERÊNCIA APROVADA 1 (Exemplo do que é correto):" },
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${ref1Base64}`, detail: "high" } },
                  { type: "text", text: "REFERÊNCIA APROVADA 2 (Exemplo do que é correto):" },
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${ref2Base64}`, detail: "high" } },
                  { type: "text", text: "FOTO CANDIDATA QUE DEVE SER JULGADA:" },
                  { type: "image_url", image_url: { url: candidateBase64, detail: "high" } }
                ]
              }
            ],
            response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: {
              type: "object",
              properties: {
                schema_version: { type: "string" },
                target_present: { type: "boolean" },
                same_task_context: { type: "boolean" },
                condition_observable: { type: "boolean" },
                condition_met: { type: "boolean" },
                image_quality_usable: { type: "boolean" },
                reference_consistency: { type: "string", enum: ["match", "mismatch", "insufficient"] },
                observed_evidence: { type: "array", items: { type: "string" } },
                blocking_reasons: { type: "array", items: { type: "string" } },
                capture_instruction: { type: "string" },
                model_decision: { type: "string", enum: ["approved", "retake", "not_verifiable"] },
                confidence: { type: "number" }
              },
              required: ["schema_version", "target_present", "same_task_context", "condition_observable", "condition_met", "image_quality_usable", "reference_consistency", "observed_evidence", "blocking_reasons", "capture_instruction", "model_decision", "confidence"],
              additionalProperties: false
            }}},
          });

          const result = LabAnalysisSchema.parse(JSON.parse(response.choices[0].message.content!));
          
          let serverDecision = result.model_decision;
          if (serverDecision === 'approved') {
            const isValid = result.target_present && 
                            result.same_task_context && 
                            result.condition_observable && 
                            result.condition_met && 
                            result.image_quality_usable && 
                            result.reference_consistency === 'match' &&
                            result.observed_evidence.length > 0 &&
                            result.confidence >= 0.90;
            if (!isValid) serverDecision = 'retake';
          }

          const latency = Date.now() - startTime;
          const usage = response.usage;

          await supabase.from('camera_openai_lab_attempts').insert({
            user_id: user.id,
            workspace_id: standard.workspace_id,
            standard_id: standard.id,
            reference_ids: refs.map((r: any) => r.id),
            ...result,
            server_decision: serverDecision,
            model,
            response_id: response.id,
            tokens_input: usage?.prompt_tokens,
            tokens_output: usage?.completion_tokens,
            tokens_total: usage?.total_tokens,
            latency_ms: latency,
            prompt_version: "v1_lab"
          });

          return new Response(JSON.stringify({
            ...result,
            server_decision: serverDecision,
            telemetry: {
              model,
              response_id: response.id,
              usage,
              latency
            }
          }), { headers: { 'Content-Type': 'application/json' } });

        } catch (err: any) {
          console.error("Lab AI Error:", err);
          return new Response(JSON.stringify({ error: 'technical_failure', message: err.message }), { status: 500 });
        }
      }
    }
  }
});
