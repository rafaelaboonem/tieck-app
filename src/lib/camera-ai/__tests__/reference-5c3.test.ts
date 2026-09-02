import { describe, it, expect } from 'vitest';
import { evaluateGate } from '../../../server/camera-ai/gate';

const baseAnalysis = {
  target_visible: true,
  target_identity_confidence: 0.95,
  condition_observable: true,
  condition_met: true,
  image_quality_usable: true,
  positive_visible_evidence: ['notebook aberto com tela e teclado visíveis'],
  negative_visible_evidence: [],
  contradictions: [],
  overall_confidence: 0.95,
};

describe('Camera AI Reference Mode Logic', () => {
  it('aprova notebook aberto em outro ângulo e com conteúdo de tela diferente', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      user_message: 'O notebook está aberto, com a tela e o teclado visíveis.',
      reference_match: true,
      reference_match_confidence: 0.95,
      reference_differences: []
    });

    expect(result.decision).toBe('approved');
    expect(result.code).toBe('verified');
  });

  it('não reprova por diferença de ângulo quando a condição relevante é atendida', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      user_message: 'O notebook está aberto.',
      reference_match: true,
      reference_match_confidence: 0.92,
      reference_differences: []
    });

    expect(result.decision).toBe('approved');
    expect(result.evidence).toContain('notebook aberto');
  });

  it('reprova notebook fechado por diferença material relevante', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      condition_met: false,
      user_message: 'O notebook está fechado.',
      reference_match: false,
      reference_match_confidence: 0.98,
      reference_differences: ['O notebook está fechado.']
    });

    expect(result.decision).toBe('retake');
    expect(result.code).toBe('reference_mismatch');
    expect(result.message).toBe('Tire outra foto. O notebook está fechado.');
  });

  it('mantém conteúdo de tela como diferença relevante quando a política o exige', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      user_message: 'A tela mostra outra aplicação.',
      reference_match: false,
      reference_match_confidence: 0.96,
      reference_differences: ['A tela não mostra a página inicial exigida pela pergunta.']
    });

    expect(result.decision).toBe('retake');
    expect(result.code).toBe('reference_mismatch');
  });

  it('mantém o threshold de 0.90 para referência', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      user_message: 'Condição observada.',
      reference_match: true,
      reference_match_confidence: 0.89,
      reference_differences: []
    });

    expect(result.decision).toBe('retake');
    expect(result.code).toBe('reference_mismatch');
  });

  it('não reutiliza mensagem positiva quando há reference_mismatch', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      user_message: 'O notebook está aberto e correto.',
      reference_match: false,
      reference_match_confidence: 0.2,
      reference_differences: ['O notebook está fechado.']
    });

    expect(result.message).toBe('Tire outra foto. O notebook está fechado.');
    expect(result.message).not.toContain('aberto e correto');
  });

  it('usa fallback coerente quando não há diferenças materiais', () => {
    const result = evaluateGate({
      ...baseAnalysis,
      user_message: 'O notebook está aberto e correto.',
      reference_match: false,
      reference_match_confidence: 0.2,
      reference_differences: []
    });

    expect(result.message).toBe('Tire outra foto. O resultado não corresponde aos critérios relevantes da referência.');
  });
});
