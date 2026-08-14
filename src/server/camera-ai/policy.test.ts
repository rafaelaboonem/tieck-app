import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraVerificationPolicyV1Schema } from './schema';
import { createHash } from 'crypto';

describe('Camera AI Policy Schema', () => {
  it('validates a complete policy', () => {
    const policy = {
      version: 1,
      questionHash: 'abc',
      verifiability: 'visual',
      target: 'pia',
      condition: 'limpa',
      requiredEvidence: ['torneira', 'cuba'],
      rejectionSignals: ['louça suja'],
      unverifiableWhen: ['escuro'],
      summary: 'A IA verá se a pia está limpa.',
      source: 'generated'
    };
    const result = CameraVerificationPolicyV1Schema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it('fails on invalid verifiability', () => {
    const policy = {
      version: 1,
      verifiability: 'invalid_status'
    };
    const result = CameraVerificationPolicyV1Schema.safeParse(policy);
    expect(result.success).toBe(false);
  });
});

describe('Question Hash Consistency', () => {
  it('generates the same hash for the same question', () => {
    const question = ' A pia está limpa? ';
    const hash1 = createHash('sha256').update(question.trim()).digest('hex');
    const hash2 = createHash('sha256').update('A pia está limpa?').digest('hex');
    expect(hash1).toBe(hash2);
  });
});
