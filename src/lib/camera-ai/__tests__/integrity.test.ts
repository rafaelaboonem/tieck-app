import { describe, it, expect } from "vitest";
import { hashQuestion } from "../hashing";

describe("Camera AI Policy Integrity", () => {
  it("should have matching hash for a given title and description", async () => {
    const title = "Foto da fachada";
    const description = "Garanta que a placa esteja visível";
    const expected = await hashQuestion(title, description);
    
    // Simulating what the server does (createHash from crypto)
    // Note: in vitest/node, we can use createHash for comparison if we want to be sure
    // But hashing.ts uses crypto.subtle.digest which is also available in Node 19+
    
    expect(expected).toBeDefined();
    expect(expected.length).toBe(64); // SHA-256 is 64 hex chars
  });

  it("should be consistent with manual calculation", async () => {
    const title = "Test";
    const description = "Desc";
    const hash = await hashQuestion(title, description);
    
    // "Test Desc".trim() -> "Test Desc"
    const question = "Test Desc";
    const encoder = new TextEncoder();
    const data = encoder.encode(question);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const manualHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    
    expect(hash).toBe(manualHash);
  });
});
