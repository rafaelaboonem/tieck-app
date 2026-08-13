import { decideGemini } from "./gemini-gate.ts";
const mockPayload = (overrides) => ({
    target_visible: true,
    target_confidence: 0.95,
    image_quality: "good",
    reference_comparable: true,
    conditions: [{
            condition: "Test",
            status: "verified",
            confidence: 0.95,
            visible_evidence: "Clearly visible"
        }],
    overall_confidence: 0.95,
    suggested_decision: "approved",
    public_message: "Approved message",
    ...overrides
});
const runTest = (name, payload, options) => {
    const result = decideGemini(payload, options);
    console.log(`Test: ${name}`);
    console.log(`Decision: ${result.decision}`);
    console.log(`Reason: ${result.reason_code}`);
    console.log(`Message: ${result.public_message}`);
    console.log("---");
};
console.log("Running Pure Gate Tests...");
// Case 1: approved
runTest("Approved", mockPayload({}), { referenceCount: 2, standardVersion: "1", snapshotVersion: "1" });
// Case 2: uncertain (insufficient_evidence)
runTest("Uncertain (insufficient evidence)", mockPayload({
    conditions: [{
            condition: "Test",
            status: "verified",
            confidence: 0.95,
            visible_evidence: "" // empty evidence
        }]
}), { referenceCount: 2, standardVersion: "1", snapshotVersion: "1" });
// Case 3: not_observable
runTest("Not Observable", mockPayload({
    conditions: [{
            condition: "Test",
            status: "not_observable",
            confidence: 0.95,
            visible_evidence: "Cannot see"
        }]
}), { referenceCount: 2, standardVersion: "1", snapshotVersion: "1" });
// Case 4: retake (dark)
runTest("Retake (dark)", mockPayload({ image_quality: "dark" }), { referenceCount: 2, standardVersion: "1", snapshotVersion: "1" });
