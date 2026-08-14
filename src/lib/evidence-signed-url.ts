import { supabase } from "@/integrations/supabase/client";

// Bucket privado — signed URLs temporárias, nunca persistidas em banco.
const BUCKET = "checklist-evidences";
const EXPIRES_IN = 60 * 60; // 1 hora

const cache = new Map<string, { url: string; expiresAt: number }>();

export async function getEvidenceSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  
  // Sanitização: remove o nome do bucket se vier no path
  const sanitizedPath = path.replace(`${BUCKET}/`, "");
  
  const cached = cache.get(sanitizedPath);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  try {
    // Chamada para a nova rota server-only para garantir acesso via service role se necessário
    const response = await fetch(`/api/camera-ai/signed-url?path=${encodeURIComponent(sanitizedPath)}&bucket=${BUCKET}`);
    if (!response.ok) {
      // Fallback para o client standard se a API falhar (pode falhar por RLS se não for owner)
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(sanitizedPath, EXPIRES_IN);
      if (error || !data?.signedUrl) return null;
      
      cache.set(sanitizedPath, { url: data.signedUrl, expiresAt: Date.now() + EXPIRES_IN * 1000 });
      return data.signedUrl;
    }

    const { signedUrl } = await response.json();
    if (!signedUrl) return null;

    cache.set(sanitizedPath, { url: signedUrl, expiresAt: Date.now() + EXPIRES_IN * 1000 });
    return signedUrl;
  } catch (err) {
    console.error("[getEvidenceSignedUrl] Fetch failed:", err);
    return null;
  }
}
