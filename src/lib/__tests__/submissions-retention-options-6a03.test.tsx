/**
 * Promotion 6A.0.3 — alinha as opções de retenção de Envios com as canônicas
 * de Configurações Gerais: [3, 4, 5, 6, 7, 15, 30].
 *
 * Cenário real corrigido: checklist com `retentionDays = 5` mostrava "3 dias"
 * no seletor de Envios porque a lista antiga [3, 7, 15, 30] não possuía a
 * opção correspondente ao valor hidratado do checklist.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain = (result: any) => {
        const c = {
          select: vi.fn(() => c),
          eq: vi.fn(() => c),
          not: vi.fn(() => c),
          order: vi.fn(() => c),
          is: vi.fn(() => c),
          single: vi.fn(async () => result),
          maybeSingle: vi.fn(async () => result),
          then: (resolve: (v: any) => any) => Promise.resolve(result).then(resolve),
        };
        return c;
      };
      if (table === "checklists") {
        // Checklist real do smoke E2E: retenção canônica de 5 dias.
        return chain({ data: { blocks: [], settings: { dataRetention: true, retentionDays: 5 }, user_id: "u1" }, error: null });
      }
      if (table === "checklist_responses") {
        return chain({ data: [], error: null });
      }
      if (table === "checklist_analytics") {
        return chain({ data: [], error: null });
      }
      if (table === "profiles") {
        return chain({ data: { plan_type: "free" }, error: null });
      }
      return chain({ data: null, error: null });
    }),
    rpc: vi.fn(async () => ({ data: [], error: null })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "tok-1" } }, error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed.example/priv" }, error: null })),
      })),
    },
  },
}));

vi.mock("@/lib/evidence-signed-url", () => ({
  getEvidenceSignedUrl: vi.fn(async () => "https://signed.example/priv"),
}));

import { SubmissionsTab } from "@/components/SubmissionsTab";

describe("Promotion 6A.0.3 — opções de retenção em Envios", () => {
  it("seletor oferece exatamente a lista canônica 3/4/5/6/7/15/30 dias", async () => {
    render(<SubmissionsTab checklistId="chk-1" />);
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
    const options = Array.from(screen.getByRole("combobox").querySelectorAll("option")).map(
      (o) => (o as HTMLOptionElement).value
    );
    expect(options).toEqual(["3", "4", "5", "6", "7", "15", "30"]);
  });

  it("retentionDays = 5 do checklist é representável e fica selecionado", async () => {
    render(<SubmissionsTab checklistId="chk-1" />);
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("5");
    });
    expect((screen.getByRole("option", { name: "5 dias" }) as HTMLOptionElement).selected).toBe(true);
  });

  it("a lista do componente não contém mais o array antigo [3, 7, 15, 30]", () => {
    const source = readComponentSource();
    expect(source).not.toContain("[3, 7, 15, 30]");
    expect(source).toContain("[3, 4, 5, 6, 7, 15, 30]");
  });
});

function readComponentSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node:fs").readFileSync(
    require("node:path").resolve(process.cwd(), "src/components/SubmissionsTab.tsx"),
    "utf8"
  );
}
