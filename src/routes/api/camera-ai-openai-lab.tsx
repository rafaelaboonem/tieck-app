import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { zodTextFormat } from "openai/helpers/zod";
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
        
        if (process.env.CAMERA_AI_MODE !== "lab_only") {
          return new Response(JSON.stringify({ error: 'forbidden', message: 'Lab mode only' }), { status: 403 });
        }
        if (!process.env.OPENAI_API_KEY) {
          return new Response(JSON.stringify({ error: 'service_unavailable', message: 'AI service not configured' }), { status: 503 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return new Response('Unauthorized', { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) return new Response('Unauthorized', { status: 401 });

        try {
          const formData = await request.formData();
          const standardId = formData.get('standardId') as string;
          const idempotencyKey = formData.get('idempotencyKey') as string;
          const candidateFile = formData.get('candidate') as File;

          if (!standardId || !candidateFile || !idempotencyKey) {
            return new Response('Missing parameters', { status: 400 });
          }

          const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
          if (!allowedMimes.includes(candidateFile.type)) {
            return new Response('Invalid file type', { status: 400 });
          }
          if (candidateFile.size > 8 * 1024 * 1024) {
            return new Response('File too large (max 8MB)', { status: 400 });
          }

          const rateLimitKey = `openai_lab:${user.id}:${standardId}`;
          const { data: rateLimitOk, error: rlErr } = await (supabase.rpc as any)('hit_public_rate_limit', {
            p_key: rateLimitKey,
            p_limit: 5,
            p_window_seconds: 600
          });

          if (rlErr || !rateLimitOk) {
            return new Response(JSON.stringify({ error: 'rate_limit', message: 'Too many attempts' }), { 
              status: 429,
              headers: { 'Retry-After': '600' }
            });
          }

          const { data: existingAttempt } = await supabase
            .from('camera_openai_lab_attempts')
            .select('*')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (existingAttempt) {
            return new Response(JSON.stringify({
              ...existingAttempt,
              telemetry: {
                model: existingAttempt.model,
                response_id: existingAttempt.response_id,
                usage: { total_tokens: existingAttempt.tokens_total },
                latency: existingAttempt.latency_ms
              }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          const { data: standard, error: stdErr } = await supabase
            .from('visual_standards')
            .select('*, references:visual_standard_references(*)')
            .eq('id', standardId)
            .single();

          if (stdErr || !standard) return new Response('Standard not found (or access denied)', { status: 404 });

          const refs = (standard.references || []).filter((r: any) => r.position === 1 || r.position === 2);
          if (refs.length !== 2) return new Response('Exactly two references required', { status: 400 });

          const getBase64 = async (path: string) => {
            const { data, error } = await supabase.storage.from('visual-standards').download(path);
            if (error || !data) throw new Error(`Failed to download reference: ${path}`);
            const buffer = await data.arrayBuffer();
            return `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
          };

          const candidateBuffer = await candidateFile.arrayBuffer();
          const candidateBase64 = `data:${candidateFile.type};base64,${Buffer.from(candidateBuffer).toString('base64')}`;

          const [ref1Url, ref2Url] = await Promise.all([
            getBase64(refs.find((r: any) => r.position === 1)!.storage_path),
            getBase64(refs.find((r: any) => r.position === 2)!.storage_path)
          ]);

          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const model = process.env.OPENAI_VISION_MODEL || "gpt-5.6";

          // Usando a Responses API seguindo rigorosamente a tipagem do SDK
          const response = await openai.responses.parse({
            model,
            input: [
              {
                role: "system",
                content: "Especialista em verificação visual. Compare a FOTO CANDIDATA com as REFERÊNCIAS. Seja conservador."
              },
              {
                role: "user",
                content: [
                  { type: "input_text", text: `PERGUNTA: ${standard.question}` },
                  { type: "input_text", text: "REFERÊNCIA VISUAL 1:" },
                  { type: "input_image", image_url: ref1Url, detail: "high" },
                  { type: "input_text", text: "REFERÊNCIA VISUAL 2:" },
                  { type: "input_image", image_url: ref2Url, detail: "high" },
                  { type: "input_text", text: "FOTO CANDIDATA:" },
                  { type: "input_image", image_url: candidateBase64, detail: "high" }
                ]
              }
            ],
            text: {
              format: zodTextFormat(LabAnalysisSchema, "camera_analysis")
            }
          });

          const result = response.output_parsed;
          if (!result) throw new Error("Falha ao processar resposta estruturada da OpenAI");

          let serverDecision: 'approved' | 'retake' | 'not_verifiable' = 'retake';
          
          const isIntegralApproved = 
            result.target_present === true &&
            result.same_task_context === true &&
            result.condition_observable === true &&
            result.condition_met === true &&
            result.image_quality_usable === true &&
            result.reference_consistency === "match" &&
            result.observed_evidence.length > 0 &&
            result.confidence >= 0.90 &&
            refs.length === 2 &&
            !!response.id &&
            !!response.usage;

          if (isIntegralApproved) {
            serverDecision = 'approved';
          } else if (!result.condition_observable) {
            serverDecision = 'not_verifiable';
          }

          const latency = Date.now() - startTime;
          const usage = response.usage;

          const attemptData = {
            user_id: user.id,
            workspace_id: standard.workspace_id,
            standard_id: standard.id,
            idempotency_key: idempotencyKey,
            reference_ids: refs.map((r: any) => r.id),
            reference_count: refs.length,
            ...result,
            server_decision: serverDecision,
            model,
            response_id: response.id,
            tokens_input: usage?.input_tokens,
            tokens_output: usage?.output_tokens,
            tokens_total: usage?.total_tokens,
            latency_ms: latency,
            prompt_version: "v2_lab_openai"
          };

          await supabase.from('camera_openai_lab_attempts').insert(attemptData);

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
