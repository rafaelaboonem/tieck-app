import OpenAI from 'openai';
import { CameraVerification, CameraVerificationSchema } from './schema';
import { zodTextFormat } from "openai/helpers/zod";

/**
 * Executes vision analysis using OpenAI Responses API.
 */
export async function analyzeImage(
  client: OpenAI,
  model: string,
  question: string,
  imageBuffer: ArrayBuffer,
  mimeType: string,
  timeoutMs: number = 20000
): Promise<CameraVerification> {
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: "system",
        content: `Você é um especialista em auditoria visual do sistema Tieck. 
Analise se a foto atende à pergunta do auditor.
REGRAS: 
- Analise APENAS o visível.
- Se não vir o alvo, condition_met=false.
- Visible_evidence deve conter apenas fatos observáveis.
- Proibido usar palavras especulativas (parece, talvez, provavelmente).`
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: `PERGUNTA: "${question}"` },
          {
            type: "input_image",
            image_data: { data: base64Image }
          }
        ]
      }
    ],
    text: {
      format: zodTextFormat(CameraVerificationSchema, "camera_verification")
    }
  }, {
    timeout: timeoutMs
  });

  const result = response.parsed;
  if (!result) {
    throw new Error('OpenAI failed to parse structured output.');
  }

  return result;
}
