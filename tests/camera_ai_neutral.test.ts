import { test, expect } from '@playwright/test';

test.describe('Camera AI Neutral Baseline', () => {
  const verifyUrl = 'http://localhost:8080/api/camera-ai/verify';

  test('POST returns 503 when CAMERA_AI_MODE=disabled', async ({ request }) => {
    // We assume CAMERA_AI_MODE is not 'enabled' in this environment or mocked
    const response = await request.post(verifyUrl, {
      data: {
        checklistId: '00000000-0000-0000-0000-000000000000',
        blockId: 'test-block',
        responseToken: 'test-token',
        evidenceId: 'test-evidence'
      }
    });

    // Content-Type should be application/json
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();
    
    // In this baseline phase, if it's not enabled, it's 503
    // If it were enabled, it would be 501 (per our implementation)
    // We check for one of these valid "safe" codes
    if (response.status() === 503) {
      expect(body.code).toBe('camera_ai_disabled');
    } else if (response.status() === 501) {
      expect(body.code).toBe('not_implemented');
    } else {
      throw new Error(`Unexpected status code: ${response.status()}`);
    }
  });

  test('GET returns 405 Method Not Allowed', async ({ request }) => {
    const response = await request.get(verifyUrl);
    expect(response.status()).toBe(405);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    expect(body.code).toBe('method_not_allowed');
  });

  test('OPTIONS returns 204', async ({ request }) => {
    const response = await request.fetch(verifyUrl, {
      method: 'OPTIONS'
    });
    expect(response.status()).toBe(204);
  });
});
