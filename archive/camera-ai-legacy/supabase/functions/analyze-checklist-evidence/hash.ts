// Hash canônico do snapshot publicado — serialização estável (ordem de chaves).
// Usado para vincular cada análise à versão exata do published_content.

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) + ":" + canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

export async function publishedContentHash(
  published: unknown,
  blockId: string,
): Promise<string> {
  const payload = canonical({ blockId, published });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}