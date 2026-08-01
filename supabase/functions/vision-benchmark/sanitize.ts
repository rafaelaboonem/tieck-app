// Sanitização compartilhada entre o handler e os testes unitários.
// Nenhum símbolo do Deno aqui — este módulo é importável em Node/Vitest.

const LEAK_PATTERNS = [
  /prompt/i, /json/i, /schema/i, /system/i, /instru(c|ç)(a|ã)o interna/i,
  /moondream/i, /llama/i, /cloudflare/i, /model/i, /token/i,
];

export function sanitizeMessage(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > 160) return fallback;
  if (LEAK_PATTERNS.some((p) => p.test(s))) return fallback;
  return s;
}

export function strList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => (v as string).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, max);
}
