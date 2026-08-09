import { z } from 'zod';

/** Hard caps sized for 1 OCPU / 6 GB API + DB VMs. */
export const LOAD_LIMITS = {
  maxUsers: 5,
  maxOrders: 2000,
  maxPayments: 2000,
  maxConcurrency: 20,
  maxBurstParallel: 10,
  maxTotalOps: 5000,
  maxTimeoutMs: 10 * 60 * 1000,
  minThinkTimeMs: 0,
  maxThinkTimeMs: 500,
} as const;

export const loadProfileSchema = z.object({
  name: z.string().min(1).max(64).default('custom'),
  users: z.number().int().min(1).max(LOAD_LIMITS.maxUsers),
  concurrency: z.number().int().min(1).max(LOAD_LIMITS.maxConcurrency),
  thinkTimeMs: z.number().int().min(LOAD_LIMITS.minThinkTimeMs).max(LOAD_LIMITS.maxThinkTimeMs).default(50),
  orders: z.object({
    count: z.number().int().min(1).max(LOAD_LIMITS.maxOrders),
    total: z.number().positive().max(1_000_000),
    dueInDays: z.number().int().min(-365).max(365).default(14),
  }),
  payments: z.object({
    partialFraction: z.number().min(0).max(1).default(0.4),
    payRemainingOnHalf: z.boolean().default(true),
  }),
  burst: z
    .object({
      enabled: z.boolean().default(false),
      amount: z.number().positive().default(600),
      parallel: z.number().int().min(1).max(LOAD_LIMITS.maxBurstParallel).default(2),
    })
    .default({ enabled: false, amount: 600, parallel: 2 }),
});

export type LoadProfile = z.infer<typeof loadProfileSchema>;

export function estimatePaymentOps(profile: LoadProfile): number {
  const partialCount = Math.ceil(profile.orders.count * profile.payments.partialFraction);
  const remainingCount = profile.payments.payRemainingOnHalf ? Math.floor(partialCount / 2) : 0;
  return partialCount + remainingCount;
}

export function estimateBurstOps(profile: LoadProfile): number {
  return profile.burst.enabled ? profile.burst.parallel : 0;
}

/** register + orders + payments + burst HTTP calls (excludes login). */
export function estimateTotalOps(profile: LoadProfile): number {
  return profile.users + profile.orders.count + estimatePaymentOps(profile) + estimateBurstOps(profile);
}

export interface ProfileValidationResult {
  ok: boolean;
  profile?: LoadProfile;
  errors: string[];
  estimates?: {
    payments: number;
    burstOps: number;
    totalOps: number;
  };
}

export function validateLoadProfile(input: unknown): ProfileValidationResult {
  const parsed = loadProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'profile'}: ${i.message}`),
    };
  }

  const profile = parsed.data;
  const payments = estimatePaymentOps(profile);
  const burstOps = estimateBurstOps(profile);
  const totalOps = estimateTotalOps(profile);
  const errors: string[] = [];

  if (payments > LOAD_LIMITS.maxPayments) {
    errors.push(`Derived payment ops ${payments} exceeds max ${LOAD_LIMITS.maxPayments}`);
  }
  if (totalOps > LOAD_LIMITS.maxTotalOps) {
    errors.push(`Estimated total ops ${totalOps} exceeds max ${LOAD_LIMITS.maxTotalOps}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors, estimates: { payments, burstOps, totalOps } };
  }

  return {
    ok: true,
    profile,
    errors: [],
    estimates: { payments, burstOps, totalOps },
  };
}

export const LOAD_PRESETS: Record<'smoke' | 'baseline' | 'stress', LoadProfile> = {
  smoke: {
    name: 'smoke',
    users: 1,
    concurrency: 4,
    thinkTimeMs: 0,
    orders: { count: 20, total: 1000, dueInDays: 14 },
    payments: { partialFraction: 1, payRemainingOnHalf: false },
    burst: { enabled: true, amount: 600, parallel: 2 },
  },
  baseline: {
    name: 'baseline',
    users: 2,
    concurrency: 8,
    thinkTimeMs: 50,
    orders: { count: 200, total: 1000, dueInDays: 14 },
    payments: { partialFraction: 0.4, payRemainingOnHalf: true },
    burst: { enabled: true, amount: 600, parallel: 2 },
  },
  stress: {
    name: 'stress',
    users: 5,
    concurrency: 20,
    thinkTimeMs: 20,
    orders: { count: 1500, total: 1000, dueInDays: 14 },
    payments: { partialFraction: 0.5, payRemainingOnHalf: true },
    burst: { enabled: true, amount: 600, parallel: 10 },
  },
};

export function getLoadLimitsResponse() {
  return {
    limits: { ...LOAD_LIMITS },
    presets: LOAD_PRESETS,
  };
}
