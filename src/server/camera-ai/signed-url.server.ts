import { createServerSupabaseClient } from "@/integrations/supabase/client.server";

export async function getSignedUrl(path: string, bucket = "checklist-evidences"): Promise<string | null> {
  const client = createServerSupabaseClient();
  if (!client) return null;

  // Sanitização do path: remove prefixo se presente
  const sanitizedPath = path.replace(`${bucket}/`, "");

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(sanitizedPath, 3600); // 1 hora

  if (error) {
    console.error(`[SignedURL] Error for ${bucket}/${sanitizedPath}:`, error);
    return null;
  }

  return data.signedUrl;
}
