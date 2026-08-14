export const hashQuestion = async (title?: string, description?: string): Promise<string> => {
  const question = `${title ?? ""} ${description ?? ""}`.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(question);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};
