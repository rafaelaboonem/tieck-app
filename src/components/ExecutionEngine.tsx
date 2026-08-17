import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { t } from "@/lib/checklist-i18n";
import { BlockRenderer } from "@/components/BlockRenderer";
import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { CameraSessionProvider } from "@/contexts/CameraSessionContext";

export function ExecutionEngine({ 
  checklist, 
  onSubmitted 
}: { 
  checklist: any; 
  onSubmitted: () => void 
}) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  
  const setAnswer = (blockId: string, value: any) => {
    setAnswers((p) => ({ ...p, [blockId]: value }));
  };

  const ensureResponseSession = async (options?: { forceNew?: boolean }): Promise<{ responseId: string; responseToken: string; checklistId: string; createdAt: number } | null> => {
    // Shared session logic from c.$id.tsx
    const checklistUuid = checklist.id;
    const sessionKey = `tieck_response_session_${checklistUuid}`;
    
    if (!options?.forceNew) {
        const raw = sessionStorage.getItem(sessionKey);
        if (raw) return JSON.parse(raw);
    }
    
    const { data } = await (supabase.rpc as any)("create_public_response", {
        p_checklist_id: checklistUuid,
        p_visitor_id: crypto.randomUUID() // Simplified for authenticated context
    });
    
    const respData = (data as any)[0];
    const session = { 
        responseId: respData.response_id, 
        responseToken: respData.response_token,
        checklistId: checklistUuid,
        createdAt: Date.now()
    };
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  };

  const readResponseSession = () => {
    const raw = sessionStorage.getItem(`tieck_response_session_${checklist.id}`);
    return raw ? JSON.parse(raw) : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    // ... [Copy logic from c.$id.tsx for validation, file upload, finalize_public_response]
    // Note: Implementation must be consistent with the logic in c.$id.tsx
    // (This component will be used by both c.$id.tsx and executar.$id.tsx)
    setUploading(false);
    onSubmitted();
  };

  const settings = checklist.settings || {};
  const blocks = checklist.blocks || [];
  const isDark = settings.theme === "Escuro";

  return (
    <CameraSessionProvider>
        <div className="p-8" style={{ backgroundColor: settings.bgColor }}>
          <h1 className="text-3xl font-bold mb-8">{checklist.title}</h1>
          <form onSubmit={handleSubmit} className="space-y-8">
            {blocks.map((block: any) => (
              block.type === "camera" ? (
                <PublicCameraBlock
                  key={block.id}
                  block={block}
                  checklistId={checklist.id}
                  ensureResponseSession={ensureResponseSession}
                  session={readResponseSession()}
                  onAnswer={setAnswer}
                  onCameraActiveChange={setCameraActive}
                  textColor={settings.textColor}
                  accentColor={settings.accentColor}
                  title={block.question || block.title}
                  language={settings.language}
                />
              ) : (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  settings={settings}
                  mode="public"
                  answers={answers}
                  setAnswer={setAnswer}
                  isDark={isDark}
                  onCameraToggle={setCameraActive}
                />
              )
            ))}
            <button type="submit" disabled={uploading}>Enviar</button>
          </form>
        </div>
    </CameraSessionProvider>
  );
}
