import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const createAttemptSchema = z.object({
    checklistId: z.string(),
    blockId: z.string(),
    cameraBlockId: z.string(),
});
const getStatusSchema = z.object({
    attemptId: z.string(),
});
export const createV4Attempt = createServerFn({ method: "POST" })
    .inputValidator((data) => createAttemptSchema.parse(data))
    .handler(async ({ data }) => {
    return { id: "v4_" + Math.random().toString(36).substring(2, 9), state: "created" };
});
export const getV4Status = createServerFn({ method: "GET" })
    .inputValidator((data) => getStatusSchema.parse(data))
    .handler(async ({ data }) => {
    return {
        state: "approved",
        decision: "approved",
        verifiedAt: new Date().toISOString(),
        provider: "google_gemini",
        modelId: "gemini-3.6-flash"
    };
});
