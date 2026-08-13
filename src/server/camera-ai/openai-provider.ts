import OpenAI from 'openai';
import { CameraVerification, CameraVerificationSchema } from './schema';
import { zodResponseFormat } from 'openai/helpers/zod';

export interface OpenAIClient {
  responses: {
    parse: (options: any) => Promise<any>;
  };
}

/**
 * Executes vision analysis using OpenAI Responses API (Structured Outputs).
 */
export async function analyzeImage(
  client: any, // OpenAI instance or mock
  model: string,
  question: string,
  imageBuffer: ArrayBuffer,
  mimeType: string,
  timeoutMs: number = 20000
): Promise<CameraVerification> {
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  // openai.responses.parse is the modern way to handle structured outputs
  const response = await client.beta.chat.completions.parse({
    model,
    messages: [
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
          { type: "text", text: `PERGUNTA: "${question}"` },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64Image}` }
          }
        ]
      }
    ],
    response_format: zodResponseFormat(CameraVerificationSchema, "camera_verification"),
  }, { timeout: timeoutMs });

  const result = response.choices[0].message.parsed;
  if (!result) {
    throw new Error('OpenAI failed to parse structured output.');
  }

  return result;
}
