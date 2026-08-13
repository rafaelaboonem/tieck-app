import { supabase } from "@/integrations/supabase/client";

export async function uploadCameraEvidence({
  file,
  checklistId,
  blockId,
  onAnswer,
}: {
  file: File;
  checklistId: string;
  blockId: string;
  onAnswer?: (blockId: string, value: string) => void;
}): Promise<string> {
  const ext = file.type.split("/")[1] || "jpg";
  const path = `responses/${checklistId}/${crypto.randomUUID()}.${ext}`;
  
  const { error: upErr } = await supabase.storage
    .from("checklist-assets")
    .upload(path, file);
  
  if (upErr) throw upErr;

  const { data: publicUrl } = supabase.storage.from("checklist-assets").getPublicUrl(path);
  const url = publicUrl.publicUrl;
  
  onAnswer?.(blockId, url);
  return url;
}
