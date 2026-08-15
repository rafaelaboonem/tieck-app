import { z } from 'zod';

export const CameraVerificationSchema = z.object({
  target_visible: z.boolean(),
  target_identity_confidence: z.number().min(0).max(1),
  condition_observable: z.boolean(),
  condition_met: z.boolean(),
  image_quality_usable: z.boolean(),
  positive_visible_evidence: z.array(z.string()),
  negative_visible_evidence: z.array(z.string()),
  contradictions: z.array(z.string()),
  overall_confidence: z.number().min(0).max(1),
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
  subtitle?: string;
  description?: string;
  required?: boolean;
  mode?: string;
  cameraAiPolicy?: CameraVerificationPolicyV1;
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

export const PolicyGenerationSchema = z.object({
  verifiability: z.enum(["visual", "partially_visual", "not_visual"]),
  target: z.string(),
  condition: z.string(),
  targetDescription: z.string(),
  conditionDescription: z.string(),
  requiredVisibleEvidence: z.array(z.string()).max(5),
  rejectionSignals: z.array(z.string()).max(5),
  notObservableSignals: z.array(z.string()).max(5),
  summary: z.string(),
});

export type PolicyGeneration = z.infer<typeof PolicyGenerationSchema>;

export const CameraVerificationPolicyV1Schema = PolicyGenerationSchema.extend({
  version: z.literal(1),
  questionHash: z.string(),
  source: z.enum(["generated", "owner_edited"]),
});

export type CameraVerificationPolicyV1 = z.infer<typeof CameraVerificationPolicyV1Schema>;

export const CompilePolicyPayloadSchema = z.object({
  checklistId: z.string().uuid(),
  blockId: z.string().min(1),
});

export type CompilePolicyPayload = z.infer<typeof CompilePolicyPayloadSchema>;
