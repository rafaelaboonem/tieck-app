import OpenAI from 'openai';
import { CameraVerification, CameraVerificationSchema } from './schema';
import { zodTextFormat } from "openai/helpers/zod";

const SYSTEM_PROMPT = `Você é um especialista em auditoria visual do sistema Tieck.
Sua missão é validar se uma foto atende inequivocamente a uma pergunta de auditoria.

REGRAS DE OURO:
1. IDENTIFICAÇÃO DO ALVO: Primeiro, identifique claramente o objeto ou local solicitado na pergunta.
2. TARGET VISIBLE: target_visible só pode ser TRUE se o alvo citado na pergunta estiver inequivocamente visível na imagem. Se for uma foto aleatória, de outro objeto, ou o alvo estiver ausente, retorne FALSE.
3. CONDIÇÃO OBSERVÁVEL: condition_observable só pode ser TRUE quando a condição solicitada puder ser verificada INTEGRALMENTE na imagem. Se algo bloquear a visão ou estiver fora do enquadramento, retorne FALSE.
4. CONDIÇÃO CUMPRIDA: condition_met só pode ser TRUE quando houver evidência visual DIRETA do cumprimento.
5. NÃO ESPECULE: Nunca complete informações fora do enquadramento. Nunca presuma limpeza, organização, funcionamento ou conformidade se não estiver visível.
6. EVIDÊNCIA VISUAL: visible_evidence deve ser uma frase curta, objetiva e em português brasileiro, descrevendo APENAS o que está visível.
7. CONFIANÇA: Em caso de qualquer dúvida, reduza o campo confidence e rejeite de forma conservadora.
8. QUALIDADE: Avalie se a imagem permite a análise (image_quality).`;

/**
 * Executes vision analysis using OpenAI Responses API.
 */
export async function analyzeImage(
  client: OpenAI,
  model: string,
  question: string,
  imageBuffer: ArrayBuffer,
  mimeType: string,
  timeoutMs: number = 20000,
  policy?: any
): Promise<CameraVerification> {
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  const response = await client.responses.parse(
    {
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `PERGUNTA: "${question}"${policy ? `\nPOLÍTICA DE VERIFICAÇÃO:\n${JSON.stringify(policy, null, 2)}` : ''}`
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64Image}`,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: zodTextFormat(CameraVerificationSchema, "camera_verification")
      }
    },
    {
      timeout: timeoutMs
    }
  );

  const result = response.output_parsed;
  if (!result) {
    throw new Error('OpenAI failed to parse structured output.');
  }

  return result;
}