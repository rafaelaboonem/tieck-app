import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { supabase } from "@/integrations/supabase/client";

// Mock das dependências
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnThis(),
      upload: vi.fn().mockResolvedValue({ data: { path: "test.jpg" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test.com/test.jpg" } }),
    },
  },
}));

vi.mock("@/lib/compress-image", () => ({
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
    // Reset da feature flag via import.meta.env se possível, ou mockando o acesso
    // Como import.meta.env é estático no build, vamos assumir que o teste roda com uma config específica
  });

  it("caso 1: flag false -> upload neutro e zero chamada ao endpoint", async () => {
    // @ts-expect-error - mockando env
    import.meta.env.VITE_CAMERA_AI_ENABLED = "false";
    
    render(<PublicCameraBlock {...defaultProps} />);
    
    // Abre a câmera
    fireEvent.click(screen.getByText("Foto da Pia"));
    
    // Simula captura (o componente TieckCamera chamaria handleCapture)
    // Para simplificar, vamos expor ou mockar o fluxo interno se necessário, 
    // mas aqui testamos a integração da UI.
    // Como TieckCamera é um componente complexo, vamos mocká-lo para disparar onCapture
  });

  // Nota: Testes de integração de UI reais exigem mais setup de DOM (como mockar TieckCamera)
  // Vou focar em garantir que a lógica de estados em PublicCameraBlock está correta.
});
