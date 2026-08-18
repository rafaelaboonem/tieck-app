import OpenAI from 'openai';
import { CameraVerification, CameraVerificationSchema, CameraVerificationPolicyV1, CameraReferenceVerification, CameraReferenceVerificationSchema } from './schema';
import { zodTextFormat } from "openai/helpers/zod";

const SYSTEM_PROMPT = `Você é um especialista em auditoria visual do sistema Tieck.
Sua missão é validar se uma foto atende inequivocamente a uma pergunta de auditoria usando uma verificação semântica rigorosa.

OBJETIVO:
Analise a pergunta e a política de verificação fornecidas e a foto capturada em uma única inferência.

CONTRATO DE ANÁLISE:
1. IDENTIFICAÇÃO DO ALVO (target_visible & target_identity_confidence):
   - Identifique o objeto/local solicitado.
   - target_visible: TRUE apenas se o alvo estiver inequivocamente visível.
   - target_identity_confidence: 0.0 a 1.0 representando a certeza da identidade do objeto.

2. OBSERVABILIDADE DA CONDIÇÃO (condition_observable):
   - TRUE somente se a condição solicitada puder ser verificada INTEGRALMENTE (sem bloqueios, cortes ou escuridão).

3. CUMPRIMENTO DA CONDIÇÃO (condition_met):
   - TRUE somente se houver evidência visual DIRETA do cumprimento da condição.

4. QUALIDADE DA IMAGEM (image_quality_usable):
   - TRUE se a foto tiver nitidez, iluminação e enquadramento suficientes para a análise.

5. EVIDÊNCIAS E CONTRADIÇÕES:
   - positive_visible_evidence: Lista de fatos visuais que confirmam a condição.
   - negative_visible_evidence: Lista de fatos visuais que negam a condição ou o alvo.
   - contradictions: Lista de elementos contraditórios ou dúvidas (deve estar vazia para aprovação).

6. MENSAGEM AO USUÁRIO (user_message):
   - Uma frase clara, objetiva e em português brasileiro.
   - Exemplos: "Foto aprovada. O notebook está aberto e a tela está visível.", "Tire outra foto. O notebook solicitado não aparece na imagem."

DIRETRIZES RÍGIDAS:
- Nunca aprove por ausência de evidência.
- Nunca especule sobre o que não está visível.
- Se houver qualquer dúvida ou contradição, reduza overall_confidence e rejeite.
- Não utilize termos técnicos ou JSON na user_message.`;

const REFERENCE_SYSTEM_PROMPT = `Você é um especialista em auditoria visual do sistema Tieck.
Sua missão é comparar uma foto capturada (candidata) com uma foto de referência (padrão esperado).

OBJETIVO:
Decidir se a foto candidata atende à pergunta de auditoria usando a foto de referência como gabarito visual.

ENTRADAS:
1. IMAGEM DE REFERÊNCIA: O padrão visual correto/esperado.
2. IMAGEM CANDIDATA: A foto tirada pelo respondente para ser avaliada.
3. PERGUNTA e POLÍTICA: O que deve ser verificado.

CONTRATO DE ANÁLISE:
1. COMPARAR COM REFERÊNCIA (reference_match & reference_match_confidence):
   - A candidata deve representar o mesmo objeto/estado da referência.
   - NÃO exija igualdade de pixels. Aceite variações naturais de ângulo, luz e fundo, a menos que a pergunta exija o contrário.
   - reference_match: TRUE se a candidata for uma versão aceitável da referência para os critérios pedidos.
   - reference_match_confidence: 0.0 a 1.0.

2. DIFERENÇAS MATERIAIS (reference_differences):
   - Liste discrepâncias relevantes entre a candidata e a referência (ex: "objeto faltando", "cor diferente", "disposição incorreta").

3. REGRAS GERAIS DE CÂMERA AI:
   - target_visible: O objeto da referência está na candidata?
   - condition_met: A condição descrita na política (usando a referência como guia) foi atendida?
   - image_quality_usable: A candidata permite a comparação?

DIRETRIZES RÍGIDAS:
- Imagem 1 é SEMPRE a REFERÊNCIA.
- Imagem 2 é SEMPRE a CANDIDATA.
- Use a referência como o "norte" da verdade visual.
- Se a referência mostra algo e a candidata mostra algo diferente que viola a pergunta, reprove.
- Em dúvida, fail-closed.
- user_message: Frase clara em português sem termos técnicos.`;

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
  policy?: CameraVerificationPolicyV1
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
              text: `PERGUNTA: "${question}"${policy ? `\nPOLÍTICA DE VERIFICAÇÃO ESTRUTURADA:\n${JSON.stringify(policy, null, 2)}` : ''}`
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

/**
 * Executes vision analysis with a reference image using OpenAI Responses API.
 */
export async function analyzeImageWithReference(
  client: OpenAI,
  model: string,
  question: string,
  candidateBuffer: ArrayBuffer,
  candidateMime: string,
  referenceBuffer: ArrayBuffer,
  referenceMime: string,
  timeoutMs: number = 25000,
  policy?: CameraVerificationPolicyV1
): Promise<CameraReferenceVerification> {
  const base64Candidate = Buffer.from(candidateBuffer).toString('base64');
  const base64Reference = Buffer.from(referenceBuffer).toString('base64');

  const response = await client.responses.parse(
    {
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: REFERENCE_SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `PERGUNTA: "${question}"${policy ? `\nPOLÍTICA DE VERIFICAÇÃO ESTRUTURADA:\n${JSON.stringify(policy, null, 2)}` : ''}`
            },
            {
              type: "input_text",
              text: "IMAGEM 1: REFERÊNCIA ESPERADA (GABARITO)"
            },
            {
              type: "input_image",
              image_url: `data:${referenceMime};base64,${base64Reference}`,
              detail: "high"
            },
            {
              type: "input_text",
              text: "IMAGEM 2: FOTO CANDIDATA (PARA AVALIAR)"
            },
            {
              type: "input_image",
              image_url: `data:${candidateMime};base64,${base64Candidate}`,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: zodTextFormat(CameraReferenceVerificationSchema, "camera_reference_verification")
      }
    },
    {
      timeout: timeoutMs
    }
  );

  const result = response.output_parsed;
  if (!result) {
    throw new Error('OpenAI failed to parse structured output for reference mode.');
  }

  return result;
}