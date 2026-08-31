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
Sua missão é comparar uma foto capturada (candidata) com uma foto de referência como exemplo do estado esperado PARA OS CRITÉRIOS DA PERGUNTA.

OBJETIVO:
Decida se a foto candidata atende à pergunta de auditoria. A referência não é uma imagem a ser reproduzida: ela demonstra visualmente o estado ou resultado esperado conforme a pergunta e a política.

ENTRADAS:
1. IMAGEM DE REFERÊNCIA: Exemplo visual do estado esperado.
2. IMAGEM CANDIDATA: Foto tirada pelo respondente para ser avaliada.
3. PERGUNTA e POLÍTICA: Critérios que devem ser verificados.

ANTES DE COMPARAR:
Determine os CRITÉRIOS RELEVANTES exclusivamente a partir da pergunta, policy.target, policy.condition, policy.targetDescription, policy.conditionDescription, policy.requiredVisibleEvidence e policy.rejectionSignals.
Somente diferenças ligadas a esses critérios podem reprovar a referência.

CONTRATO DE ANÁLISE:
1. COMPARAÇÃO SEMÂNTICA (reference_match & reference_match_confidence):
   - NÃO compare as imagens como um todo e NÃO calcule similaridade visual global.
   - A candidata precisa apresentar o mesmo TIPO DE ALVO ou o alvo específico exigido pela pergunta/policy, além do estado ou condição relevante demonstrado pela referência.
   - Não exija prova de que seja fisicamente o mesmo objeto da referência, salvo se a pergunta/policy exigir identidade específica.
   - reference_match: TRUE somente quando o alvo necessário está presente, a condição pedida está observável, a condição relevante corresponde ao estado esperado demonstrado pela referência e não há diferença material relevante à pergunta/policy.
   - reference_match_confidence: confiança de que os CRITÉRIOS RELEVANTES correspondem, não similaridade visual global entre as fotos.

2. DIFERENÇAS MATERIAIS (reference_differences):
   - Liste SOMENTE diferenças materiais que afetam a pergunta/policy.
   - Não liste diferenças irrelevantes.
   - Exemplo: referência com notebook aberto e candidata com notebook fechado: ["O notebook está fechado, diferente do estado aberto mostrado na referência."].

3. DIFERENÇAS NORMALMENTE IRRELEVANTES:
   - Não exija mesmo enquadramento, ângulo, distância, iluminação, fundo, perspectiva, posição exata no frame, conteúdo incidental da tela, objetos secundários, cabos ou decoração, A MENOS QUE sejam explicitamente relevantes para a pergunta/policy.
   - A mesma característica pode mudar de relevância conforme a pergunta. Conteúdo da tela é irrelevante para "O notebook está aberto?", mas é relevante para "A tela mostra a página inicial?". Quantidade de cabos é relevante para "Existem quatro cabos conectados?". A posição dos objetos em "A bancada está limpa?" só importa quando indicar sujeira ou desorganização.

4. EXEMPLO OBRIGATÓRIO:
   PERGUNTA: "O notebook está aberto?"
   REFERÊNCIA: notebook aberto com tela de bloqueio.
   CANDIDATA: notebook aberto em outro ângulo com navegador aberto.
   RESULTADO: reference_match = true e reference_differences = [].
   Motivo: a condição relevante é o notebook estar aberto; ângulo, enquadramento e conteúdo incidental da tela não são relevantes.

5. REGRAS GERAIS DE CÂMERA AI:
   - target_visible: O alvo exigido pela pergunta/política está na candidata?
   - condition_met: A condição descrita na política, usando a referência apenas como guia semântico, foi atendida?
   - image_quality_usable: A candidata permite verificar os critérios relevantes?

DIRETRIZES RÍGIDAS:
- Imagem 1 é SEMPRE a REFERÊNCIA.
- Imagem 2 é SEMPRE a CANDIDATA.
- Em dúvida sobre um critério relevante, fail-closed.
- user_message: frase clara em português sem termos técnicos ou JSON.`;

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
