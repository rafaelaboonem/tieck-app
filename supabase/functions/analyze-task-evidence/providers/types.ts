// Contratos compartilhados de análise visual — provedor-agnósticos.
// A Edge Function consome estes tipos.

export type VisionProvider = "openai" | "manual";
export type VisionFallbackMode = "none" | "manual_review" | "openai";
export type EvidenceDecision =
  | "approved"
  | "rejected"
  | "manual_review"
  | "analysis_failed";

export interface DetectedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/** Resultado normalizado gravado em `evidence_ai_analyses`. */
export interface NormalizedAnalysis {
  provider: VisionProvider;
  decision: EvidenceDecision;
  confidence: number | null;
  summary: string | null;
  anomalyScore?: number | null;
  threshold?: number | null;
  detectedRegions?: DetectedRegion[];
  anomalyMapStoragePath?: string | null;
  inferenceTimeMs?: number | null;
  modelId?: string | null;
  modelVersion?: string | null;
  criteriaResults?: unknown;
  detectedProblems?: string[];
  resubmitInstructions?: string | null;
  imageQuality?: { acceptable: boolean; issues: string[] } | null;
  rawResult?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}
