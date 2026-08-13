import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock URL methods
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock crypto.randomUUID
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = vi.fn(() => '1234-5678-90ab-cdef');
}

// Mock process.env for import.meta.env
// In Vitest with jsdom, import.meta.env is handled by the bundler/test runner.
// We use vi.stubGlobal and also mock the env specifically for the component's read.
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_CAMERA_AI_ENABLED: 'true'
    }
  }
});
