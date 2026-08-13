import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { CameraAIProvider, CameraAIStructuredOutput, CameraAIStructuredOutputSchema } from "./types";

export class OpenAICameraProvider implements CameraAIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyze({
    question,
    imageBuffer,
    mimeType,
  }: {
    question: string;
    imageBuffer: Buffer;
    mimeType: string;
  }): Promise<CameraAIStructuredOutput> {
    const base64Image = imageBuffer.toString("base64");

    const response = await (this.client as any).beta.chat.completions.parse({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `Você é um auditor visual rigoroso do Tieck. 
Analise a foto enviada pelo usuário com base na pergunta/instrução fornecida.
Regras críticas:
1. Analise SOMENTE o que está visível. Não presuma fatos fora da imagem.
2. Se o alvo da pergunta não estiver presente ou for impossível de identificar, defina target_present como false.
3. Se a condição não puder ser confirmada visualmente (ex: "o motor está quente"), retorne condition_observable como false e model_decision como not_observable.
4. Evidências ambíguas NUNCA podem ser aprovadas.
5. user_message deve ser curta (máximo 120 caracteres), clara, em português e descrever o motivo observável do resultado.
6. Se falhar, falhe fechado. Na dúvida, peça para tirar outra foto (retake).`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Pergunta/Critério: ${question}` },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "auto",
              },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(CameraAIStructuredOutputSchema, "camera_analysis"),
      max_tokens: 300,
      store: false,
    });

    const parsed = response.choices[0].message.parsed;
    if (!parsed) {
      throw new Error("OpenAI failed to return a valid structured output");
    }

    return parsed;
  }
}
