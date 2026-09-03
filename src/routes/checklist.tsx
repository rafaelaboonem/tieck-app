import { useEffect, useMemo, useState } from "react";
import { hashQuestion } from "@/lib/camera-ai/hashing";
import { CameraSettingsPanel } from "@/components/camera-ai/CameraSettingsPanel";

export interface CameraBlockEditorProps {
  block: any;
  isActive: boolean;
  currentChecklistId: string;
  updateBlock: (id: string, patch: any) => void;
  removeBlock: (id: string) => void;
  setActiveBlockId: (id: string | null) => void;
  textColor: string;
  textareaRefs: React.RefObject<Record<string, HTMLTextAreaElement>>;
}

export function CameraBlockEditor({ block, isActive, currentChecklistId, updateBlock, removeBlock, setActiveBlockId, textColor, textareaRefs }: CameraBlockEditorProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [currentQuestionHash, setCurrentQuestionHash] = useState<string | null>(null);

  const title = block.title || block.subtitle || "";
  const description = block.description || "";

  useEffect(() => {
    let cancelled = false;
    void hashQuestion(title, description).then((hash) => {
      if (!cancelled) setCurrentQuestionHash(hash);
    });
    return () => { cancelled = true; };
  }, [title, description]);

  const isCameraPolicyReady = useMemo(() => Boolean(
    block.cameraAiPolicy &&
    block.cameraAiNeedsRevalidation !== true &&
    currentQuestionHash !== null &&
    block.cameraAiPolicy.questionHash === currentQuestionHash &&
    !isCompiling
  ), [block.cameraAiPolicy, block.cameraAiNeedsRevalidation, currentQuestionHash, isCompiling]);

  return (
    <>
      <button type="button" onClick={() => { setActiveBlockId(block.id); setIsPanelOpen(true); }} style={{ color: textColor }}>
        {title || "Câmera"}
      </button>
      <CameraSettingsPanel
        block={block}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={(patch) => updateBlock(block.id, patch)}
        isCompiling={isCompiling}
        isCameraPolicyReady={isCameraPolicyReady}
        checklistId={currentChecklistId}
      />
    </>
  );
}

export default function Checklist() {
  return null;
}
