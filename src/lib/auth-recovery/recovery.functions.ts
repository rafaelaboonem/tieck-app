import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requestPasswordReset, verifyPasswordReset, completePasswordReset } from "./recovery.server";

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    return requestPasswordReset(data.email);
  });

export const verifyPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; code: string }) => 
    z.object({ 
      email: z.string().email(),
      code: z.string().length(6)
    }).parse(data)
  )
  .handler(async ({ data }) => {
    return verifyPasswordReset(data.email, data.code);
  });

export const completePasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; resetToken: string; newPassword: string }) => 
    z.object({ 
      email: z.string().email(),
      resetToken: z.string().min(10),
      newPassword: z.string().min(8)
    }).parse(data)
  )
  .handler(async ({ data }) => {
    return completePasswordReset(data.email, data.resetToken, data.newPassword);
  });
