import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
  fullName: z.string().min(1, "Name is required"),
  role: z.enum(["student", "lecturer", "researcher"]).optional(),
});
export type RegisterFormValues = z.infer<typeof registerSchema>;
