// Abstração de provedor visual (Camera AI V3 — Fase 3A).
// Módulo puro: sem Deno, sem rede — importável pelos testes.
//
// A implementação Cloudflare (Moondream + Llama) continua viva em index.ts.
// Esta camada existe para permitir a troca de provedor sem apagar o rollback.

export type VisionProvider = "google_gemini" | "cloudflare";

export const DEFAULT_LAB_PROVIDER: VisionProvider = "google_gemini";

/** Modelo fixado nesta fase. Nunca vem do frontend. */
export const GEMINI_MODEL_ID = "gemini-3.6-flash";

export function normalizeProvider(raw: unknown): VisionProvider {
  const s = String(raw ?? "").trim();
  return s === "cloudflare" ? "cloudflare" : DEFAULT_LAB_PROVIDER;
}
