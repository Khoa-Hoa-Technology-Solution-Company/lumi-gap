import { z } from "zod";

export const RegisterDeviceTokenSchema = z.object({
  token: z.string().min(10).max(512),
  platform: z.enum(["android", "ios", "web", "unknown"]).default("unknown"),
  deviceName: z.string().max(120).optional(),
});

export type RegisterDeviceTokenInput = z.infer<typeof RegisterDeviceTokenSchema>;
