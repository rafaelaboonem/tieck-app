import { test, expect } from '@playwright/test';

test.describe('Camera AI Verify Endpoint - Phase 0.6', () => {
  test('OPTIONS returns 204', async ({ request }) => {
    const response = await request.fetch('/api/camera-ai/verify', {
      method: 'OPTIONS',
    });
    expect(response.status()).toBe(204);
  });

  test('GET returns 405', async ({ request }) => {
    const response = await request.get('/api/camera-ai/verify');
    expect(response.status()).toBe(405);
    const body = await response.json();
    expect(body.code).toBe('method_not_allowed');
  });

  test('POST with disabled mode returns 503', async ({ request }) => {
    // Note: We are testing the current environment state (CAMERA_AI_MODE=disabled by default)
    const response = await request.post('/api/camera-ai/verify', {
      data: {}
    });
    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('camera_ai_disabled');
    expect(body.message).toBe('A verificação inteligente ainda não está disponível.');
  });
});
