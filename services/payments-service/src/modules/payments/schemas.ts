import { z } from 'zod';

export const recordPaymentSchema = z.object({
  amount: z.number().min(0.01, 'Payment amount must be at least $0.01.'),
  paymentDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'A valid payment date is required.'),
  note: z.string().trim().max(1000).optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
