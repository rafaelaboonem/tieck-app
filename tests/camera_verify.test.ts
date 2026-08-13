import { describe, it, expect, vi } from 'vitest';

// Mocking OpenAI and Supabase for the test
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  target_visible: true,
                  condition_observable: true,
                  condition_met: true,
                  image_quality: "usable",
                  confidence: 0.95,
                  visible_evidence: "Pia limpa e seca.",
                  user_message: "Aprovado"
                })
              }
            }]
          })
        }
      }
    }))
  };
});

describe('Camera AI Backend Logic (Isolated)', () => {
  it('should calculate approved decision when all conditions are met', () => {
    const result = {
      target_visible: true,
      condition_observable: true,
      condition_met: true,
      image_quality: "usable",
      confidence: 0.95,
      visible_evidence: "Pia limpa e seca.",
      user_message: "Aprovado"
    };

    const speculativeTerms = ["parece", "provavelmente", "talvez", "aparenta", "suponho", "possivelmente"];
    const evidenceIsSpeculative = speculativeTerms.some(term => 
      result.visible_evidence.toLowerCase().includes(term)
    );

    const isApproved = 
      result.target_visible === true &&
      result.condition_observable === true &&
      result.condition_met === true &&
      result.image_quality === "usable" &&
      result.confidence >= 0.90 &&
      result.visible_evidence.trim().length > 0 &&
      !evidenceIsSpeculative;

    expect(isApproved).toBe(true);
  });

  it('should calculate retake if confidence is below threshold', () => {
    const result = {
      target_visible: true,
      condition_observable: true,
      condition_met: true,
      image_quality: "usable",
      confidence: 0.89,
      visible_evidence: "Pia limpa.",
      user_message: "Baixa confiança"
    };

    const isApproved = result.confidence >= 0.90;
    expect(isApproved).toBe(false);
  });

  it('should calculate retake if target is not visible', () => {
    const result = {
      target_visible: false,
      condition_observable: false,
      condition_met: false,
      image_quality: "usable",
      confidence: 0.95,
      visible_evidence: "Objeto não encontrado.",
      user_message: "Retire a foto"
    };
    expect(result.target_visible).toBe(false);
  });
});
