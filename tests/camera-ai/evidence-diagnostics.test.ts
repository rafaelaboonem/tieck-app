import { describe, it, expect } from 'vitest';
import { getEvidenceSignedUrl } from '../../src/lib/evidence-signed-url';

describe('Evidence Diagnostics', () => {
  it('should handle empty paths gracefully', async () => {
    const url = await getEvidenceSignedUrl('');
    expect(url).toBeNull();
  });
});
