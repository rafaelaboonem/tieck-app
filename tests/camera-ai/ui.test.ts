import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PublicCameraBlock } from "../../src/components/PublicCameraBlock";

// Mock das dependências
vi.mock("../../src/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnThis(),
      upload: vi.fn().mockResolvedValue({ data: { path: "test.jpg" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test.com/test.jpg" } }),
    },
  },
}));

vi.mock("../../src/lib/compress-image", () => ({
  compressImage: vi.fn().mockImplementation((file) => Promise.resolve(file)),
}));

// Mock do fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock de URL.createObjectURL e revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:test");
global.URL.revokeObjectURL = vi.fn();

describe("PublicCameraBlock UI (Camera AI V5)", () => {
  const defaultBlock = {
    id: "block-1",
    type: "camera" as const,
    title: "Foto da Pia",
  };

  const defaultProps = {
    block: defaultBlock,
    checklistId: "checklist-1",
    ensureResponseSession: vi.fn().mockResolvedValue({ responseId: "res-1", responseToken: "tok-1" }),
    onAnswer: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza o botão inicial corretamente", () => {
    render(React.createElement(PublicCameraBlock, defaultProps));
    expect(screen.getByText("Foto da Pia")).toBeInTheDocument();
  });
});
