import { supabase } from "@/integrations/supabase/client";

// Bucket privado — signed URLs temporárias, nunca persistidas em banco.
const BUCKET = "evidences";
const EXPIRES_IN = 60 * 10; // 10 minutos

const cache = new Map<string, { url: string; expiresAt: number }>();

export async function getEvidenceSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES_IN);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + EXPIRES_IN * 1000 });
  return data.signedUrl;
}