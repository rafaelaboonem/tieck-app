import { describe, it, expect } from "vitest";
import { hashQuestion } from "../hashing";

describe("Camera AI Race Condition & Freshness", () => {
  it("should detect stale policy when title changes", async () => {
    const title1 = "Question A";
    const desc1 = "Desc A";
    const hash1 = await hashQuestion(title1, desc1);
    
    const title2 = "Question B";
    const hash2 = await hashQuestion(title2, desc1);
    
    expect(hash1).not.toBe(hash2);
  });

  it("should ensure snapshot consistency strategy", async () => {
    // This is a logic test for the strategy implemented in checklist.tsx
    const mockBlock = {
      id: "cam-1",
      type: "camera",
      title: "New Title",
      description: "New Desc",
      cameraAiPolicy: {
        questionHash: "OLD_HASH",
        version: 1
      },
      cameraAiNeedsRevalidation: true
    };

    const expectedHash = await hashQuestion(mockBlock.title, mockBlock.description);
    const needsCompile = !mockBlock.cameraAiPolicy || 
                        (mockBlock.cameraAiPolicy as any).questionHash !== expectedHash ||
                        mockBlock.cameraAiNeedsRevalidation;

    expect(needsCompile).toBe(true);
  });
});
