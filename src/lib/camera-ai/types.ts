import { z } from "zod";

/**
 * Contract version: tieck_camera_v1
 */
export const CameraAIStructuredOutputSchema = z.object({
  schema_version: z.literal("tieck_camera_v1"),
  target_present: z.boolean(),
  condition_observable: z.boolean(),
  condition_met: z.boolean(),
  image_quality_usable: z.boolean(),
  confidence: z.number().min(0).max(1),
  visible_evidence: z.string(),
  failure_reason: z.enum([
    "none",
    "target_missing",
    "condition_not_met",
    "poor_quality",
    "not_observable",
  ]),
  model_decision: z.enum(["approved", "retake", "not_observable"]),
  user_message: z.string(),
});

export type CameraAIStructuredOutput = z.infer<typeof CameraAIStructuredOutputSchema>;

export interface CameraAIVerifyResult {
  ok: boolean;
  decision: "approved" | "retake" | "not_observable" | "technical_failure";
  message: string;
  confidence?: number;
  requestId: string;
}

export interface CameraAIProvider {
  analyze(params: {
    question: string;
    imageBuffer: Buffer;
    mimeType: string;
  }): Promise<CameraAIStructuredOutput>;
}
