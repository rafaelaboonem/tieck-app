import { supabase } from "@/integrations/supabase/client";

export async function uploadCameraEvidence(file: File, checklistId: string, responseId: string, blockId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${checklistId}/${responseId}/${blockId}/${crypto.randomUUID()}.${ext}`;
  
  const { error } = await supabase.storage
    .from('checklist-evidences')
    .upload(path, file);

  if (error) throw error;
  
  const { data } = supabase.storage.from('checklist-evidences').getPublicUrl(path);
  return data.publicUrl;
}
