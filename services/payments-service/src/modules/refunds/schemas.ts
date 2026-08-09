import { z } from 'zod';

export const recordRefundSchema = z.object({
  amount: z.number().min(0.01, 'Refund amount must be at least $0.01.'),
  refundDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'A valid refund date is required.'),
  note: z.string().trim().max(1000).optional(),
});

export type RecordRefundInput = z.infer<typeof recordRefundSchema>;
