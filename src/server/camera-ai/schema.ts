import { z } from 'zod';

export const CameraVerificationSchema = z.object({
  target_visible: z.boolean(),
  condition_observable: z.boolean(),
  condition_met: z.boolean(),
  image_quality: z.enum(["usable", "dark", "blurry", "cropped", "unusable"]),
  confidence: z.number().min(0).max(1),
  visible_evidence: z.string().min(1),
  user_message: z.string().min(1)
});

export type CameraVerification = z.infer<typeof CameraVerificationSchema>;

export const VerifyPayloadSchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string().min(1),
  responseToken: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

export type VerifyPayload = z.infer<typeof VerifyPayloadSchema>;

export type Decision = 'approved' | 'retake' | 'not_observable' | 'technical_failure';

export interface PublishedBlock {
  id: string;
  type: string;
  title?: string;
  description?: string;
}

export interface VerificationResult {
  ok: boolean;
  decision: Decision;
  code: string;
  message: string;
  evidence?: string;
  requestId?: string;
  evidenceId?: string;
  persisted?: boolean;
}
