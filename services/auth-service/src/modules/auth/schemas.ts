/**
 * Request validation schemas for the auth module. Validating at the API
 * boundary means malformed requests are rejected with a clear
 * VALIDATION_ERROR before any business logic or database call runs.
 */
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email address is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email address is required.'),
  password: z.string().min(1, 'Password is required.'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
