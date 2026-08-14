import { z } from "zod";

export const CameraAIResponseSchema = z.object({
  ok: z.boolean(),
  decision: z.enum(["approved", "retake", "not_observable", "technical_failure"]).optional(),
  code: z.string(),
  message: z.string().optional(),
  evidence: z.string().optional(),
  evidenceId: z.string().uuid().optional(),
  persisted: z.boolean().optional(),
});

export type CameraAIResponse = z.infer<typeof CameraAIResponseSchema>;

export interface PublicCameraBlockData {
  id: string;
  type: "camera";
  title?: string;
  question?: string;
  description?: string;
  required?: boolean;
}
