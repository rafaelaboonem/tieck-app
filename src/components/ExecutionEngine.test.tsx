/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExecutionEngine } from "./ExecutionEngine";
import { supabase } from "@/integrations/supabase/client";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "http://example.com/img.jpg" } })),
      })),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

const mockChecklist = {
  id: "checklist-123",
  title: "Checklist de Teste",
  blocks: [
    {
      id: "block-1",
      type: "short-answer",
      subtitle: "Pergunta 1",
      required: true,
    },
  ],
  settings: {
    language: "pt-BR",
  },
};

describe("ExecutionEngine authenticated mode", () => {
  it("should send correct answers to finalize_public_response when in authenticated mode", async () => {
    // Mock the session creation
    (supabase.rpc as any).mockImplementation((fn: string) => {
      if (fn === "create_public_response") {
        return Promise.resolve({
          data: [{ response_id: "resp-1", response_token: "token-1" }],
          error: null,
        });
      }
      if (fn === "finalize_public_response") {
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const onSubmitted = vi.fn();
    render(<ExecutionEngine checklist={mockChecklist} mode="authenticated" onSubmitted={onSubmitted} />);

    // Check if input is functional (not just a preview)
    const input = screen.getByPlaceholderText("Sua resposta");
    fireEvent.change(input, { target: { value: "Resposta de teste" } });
    expect((input as HTMLInputElement).value).toBe("Resposta de teste");

    // Submit
    const submitBtn = screen.getByRole("button", { name: /enviar/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith("finalize_public_response", expect.objectContaining({
        p_answers: expect.objectContaining({
          "block-1": "Resposta de teste"
        }),
        p_response_token: "token-1"
      }));
    });

    expect(onSubmitted).toHaveBeenCalled();
  });
});
