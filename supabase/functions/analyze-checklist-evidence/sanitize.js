// Sanitização compartilhada entre o handler e os testes unitários.
// Nenhum símbolo do Deno aqui — este módulo é importável em Node/Vitest.
const LEAK_PATTERNS = [
    /prompt/i, /json/i, /schema/i, /system/i, /instru(c|ç)(a|ã)o interna/i,
    /moondream/i, /llama/i, /cloudflare/i, /model/i, /token/i,
];
export function sanitizeMessage(raw, fallback) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || s.length > 160)
        return fallback;
    if (LEAK_PATTERNS.some((p) => p.test(s)))
        return fallback;
    return s;
}
export function strList(value, max = 6) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((v) => typeof v === "string")
        .map((v) => v.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, max);
}
