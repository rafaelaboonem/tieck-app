import { describe, it, expect, vi, beforeAll } from "vitest";
import { ensureCameraBlockIds } from "../../src/lib/camera-blocks";

describe("Checklist Editor - Persistence and Hooks Stability", () => {
  it("should keep cameraAiPolicy during normalization", () => {
    const policy = {
      version: 1,
      questionHash: "hash123",
      verifiability: "visual",
      summary: "test",
      requiredEvidence: [],
      rejectionSignals: [],
      source: "ai_generated"
    };
    
    const blocks = [
      { id: "b1", type: "camera", title: "Cam 1", cameraAiPolicy: policy }
    ];
    
    const { blocks: normalized } = ensureCameraBlockIds(blocks as any[]);
    expect(normalized[0].cameraAiPolicy).toEqual(policy);
    expect(normalized[0].cameraBlockId).toBeDefined();
  });

  it("should handle legacy camera blocks without policy", () => {
    const blocks = [
      { id: "b1", type: "camera", title: "Legacy Cam" }
    ];
    
    const { blocks: normalized } = ensureCameraBlockIds(blocks as any[]);
    expect(normalized[0].cameraAiPolicy).toBeUndefined();
    expect(normalized[0].cameraBlockId).toBeDefined();
  });
});
