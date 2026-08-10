import { Camera, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TieckCamera } from "./TieckCamera";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { compressImage } from "@/lib/compress-image";

interface PublicCameraBlockProps {
  block: any;
  checklistId: string;
  accentColor?: string;
  textColor?: string;
  title?: string;
  onAnswer?: (blockId: string, value: string) => void;
  onCameraActiveChange?: (active: boolean) => void;
  session?: { responseId: string; responseToken: string } | null;
  ensureResponseSession: () => Promise<{ responseId: string; responseToken: string } | null>;
}

type VerificationPhase = "idle" | "capturing" | "uploading" | "received" | "technical_failure";

export function PublicCameraBlock({
  block,
  checklistId,
  accentColor,
  textColor,
  title,
  onAnswer,
  onCameraActiveChange,
  session,
  ensureResponseSession,
}: PublicCameraBlockProps) {
  const [phase, setPhase] = useState<VerificationPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleCapture = async (source: File | string) => {
    if (typeof source === "string") {
      setPreview(source);
      // TieckCamera can return base64 for preview, but we need a file for storage
      const blob = await (await fetch(source)).blob();
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      void processFile(file);
      return;
    }
    setPreview(URL.createObjectURL(source));
    void processFile(source);
  };

  const processFile = async (file: File) => {
    const active = session ?? (await ensureResponseSession());
    if (!active) {
      setErrorMsg("Falha ao iniciar sessão.");
      setPhase("technical_failure");
      return;
    }
    setPhase("uploading");

    try {
      let fileToUpload = file;
      if (file.size > 400_000) {
        const compressed = await compressImage(file);
        if (compressed) fileToUpload = compressed;
      }

      const ext = fileToUpload.type.split("/")[1] || "jpg";
      const path = `responses/${checklistId}/${crypto.randomUUID()}.${ext}`;
      
      const { error: upErr } = await supabase.storage
        .from("checklist-assets")
        .upload(path, fileToUpload);
      
      if (upErr) throw upErr;

      const { data: publicUrl } = supabase.storage.from("checklist-assets").getPublicUrl(path);
      
      onAnswer?.(block.id, publicUrl.publicUrl);
      setPhase("received");
    } catch (err) {
      console.error("Upload error:", err);
      setErrorMsg("Erro ao enviar foto.");
      setPhase("technical_failure");
    }
  };

  const openCamera = () => {
    setPhase("capturing");
    setErrorMsg(null);
  };

  if (phase === "capturing") {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <TieckCamera
          open={true}
          title={title || "Câmera"}
          onCapture={handleCapture}
          onClose={() => setPhase("idle")}
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {phase === "idle" && (
        <Button
          variant="outline"
          className="w-full h-16 border-dashed flex items-center justify-center gap-2"
          onClick={openCamera}
          style={{ borderColor: accentColor, color: textColor }}
        >
          <Camera className="w-5 h-5" />
          <span>{title || "Adicionar foto"}</span>
        </Button>
      )}

      {phase === "uploading" && (
        <div className="flex items-center gap-3 p-4 border rounded-xl bg-white shadow-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Enviando foto...</span>
        </div>
      )}

      {phase === "received" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 border rounded-xl bg-emerald-50 border-emerald-100 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-900">Foto recebida</span>
            </div>
            <Button variant="ghost" size="sm" onClick={openCamera} className="text-emerald-700 hover:bg-emerald-100">
              <RefreshCw className="w-4 h-4 mr-2" />
              Trocar
            </Button>
          </div>
          {preview && (
            <div className="relative aspect-video rounded-xl overflow-hidden border">
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      )}

      {phase === "technical_failure" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <span>{errorMsg || "Erro técnico."}</span>
            <Button variant="ghost" size="sm" onClick={openCamera} className="h-auto p-0 underline">
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
