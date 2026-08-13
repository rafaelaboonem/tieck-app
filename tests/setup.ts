import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock URL methods
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock crypto.randomUUID
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = vi.fn(() => '1234-5678-90ab-cdef');
}

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_CAMERA_AI_ENABLED: 'true'
    }
  }
});
