import { hashQuestion } from "../../src/lib/camera-ai/hashing";

describe("Camera AI Policy Integrity", () => {
  it("should have matching hash for a given title and description", async () => {
    const title = "Foto da fachada";
    const description = "Garanta que a placa esteja visível";
    const expected = await hashQuestion(title, description);
    
    // Simulating what the server does
    const question = (String(title || "") + " " + String(description || "")).trim();
    const encoder = new TextEncoder();
    const data = encoder.encode(question);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const serverStyleHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    
    expect(expected).toBe(serverStyleHash);
  });
});
