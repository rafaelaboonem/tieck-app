import { describe, it, expect } from 'vitest';
import { hashQuestion } from '../../src/lib/camera-ai/hashing';

describe('hashQuestion', () => {
  it('geral o mesmo hash SHA-256 que o servidor para a mesma entrada', async () => {
    const title = "Test";
    const description = "";
    const expected = "532eaabd9574880dbf76b9b8cc00832c20a6ec113d682299550d7a6e0f345e25";
    
    const hash = await hashQuestion(title, description);
    expect(hash).toBe(expected);
  });

  it('normaliza corretamente espaços e nulos', async () => {
    const hash1 = await hashQuestion("  Test  ", "  ");
    const hash2 = await hashQuestion("Test", undefined);
    expect(hash1).toBe(hash2);
  });
});
