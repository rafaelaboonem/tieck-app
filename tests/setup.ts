import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock URL methods
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock crypto.randomUUID
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = vi.fn(() => '1234-5678-90ab-cdef');
}

// Remove the global meta.env stub.
// Environment variables should be managed via vi.stubEnv('VITE_CAMERA_AI_ENABLED', '...') within individual tests.
