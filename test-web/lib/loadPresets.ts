import type { LoadLimits, LoadPresetId, LoadProfile } from "./api/types";

export type { LoadPresetId };

export interface LoadPresetMeta {
  id: LoadPresetId;
  label: string;
  description: string;
}

/** UI copy for presets — values come from the server when available. */
export const LOAD_PRESET_META: LoadPresetMeta[] = [
  {
    id: "smoke",
    label: "Smoke",
    description: "Tiny run (~20 orders) to verify the load path on this small VM.",
  },
  {
    id: "baseline",
    label: "Baseline",
    description: "Moderate traffic (~200 orders, concurrency 8) — good default for 1 OCPU.",
  },
  {
    id: "stress",
    label: "Stress",
    description: "Near the hard caps (~1500 orders, concurrency 20). Expect higher latency.",
  },
];

/** Fallback presets if the runner omits them (must stay within LOAD_LIMITS). */
export const FALLBACK_PRESETS: Record<LoadPresetId, LoadProfile> = {
  smoke: {
    name: "smoke",
    users: 1,
    concurrency: 4,
    thinkTimeMs: 0,
    orders: { count: 20, total: 1000, dueInDays: 14 },
    payments: { partialFraction: 1, payRemainingOnHalf: false },
    burst: { enabled: true, amount: 600, parallel: 2 },
  },
  baseline: {
    name: "baseline",
    users: 2,
    concurrency: 8,
    thinkTimeMs: 50,
    orders: { count: 200, total: 1000, dueInDays: 14 },
    payments: { partialFraction: 0.4, payRemainingOnHalf: true },
    burst: { enabled: true, amount: 600, parallel: 2 },
  },
  stress: {
    name: "stress",
    users: 5,
    concurrency: 20,
    thinkTimeMs: 20,
    orders: { count: 1500, total: 1000, dueInDays: 14 },
    payments: { partialFraction: 0.5, payRemainingOnHalf: true },
    burst: { enabled: true, amount: 600, parallel: 10 },
  },
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function estimatePaymentOps(profile: LoadProfile): number {
  const partialCount = Math.ceil(profile.orders.count * profile.payments.partialFraction);
  const remainingCount = profile.payments.payRemainingOnHalf ? Math.floor(partialCount / 2) : 0;
  return partialCount + remainingCount;
}

export function estimateBurstOps(profile: LoadProfile): number {
  return profile.burst.enabled ? profile.burst.parallel : 0;
}

export function estimateTotalOps(profile: LoadProfile): number {
  return profile.users + profile.orders.count + estimatePaymentOps(profile) + estimateBurstOps(profile);
}

/** Clamp a load profile to the hard caps returned by the runner. */
export function clampLoadProfile(profile: LoadProfile, limits: LoadLimits): LoadProfile {
  return {
    name: profile.name || "custom",
    users: clamp(Math.floor(profile.users), 1, limits.maxUsers),
    concurrency: clamp(Math.floor(profile.concurrency), 1, limits.maxConcurrency),
    thinkTimeMs: clamp(Math.floor(profile.thinkTimeMs), limits.minThinkTimeMs, limits.maxThinkTimeMs),
    orders: {
      count: clamp(Math.floor(profile.orders.count), 1, limits.maxOrders),
      total: Math.max(0.01, profile.orders.total),
      dueInDays: clamp(Math.floor(profile.orders.dueInDays), -365, 365),
    },
    payments: {
      partialFraction: clamp(profile.payments.partialFraction, 0, 1),
      payRemainingOnHalf: Boolean(profile.payments.payRemainingOnHalf),
    },
    burst: {
      enabled: Boolean(profile.burst.enabled),
      amount: Math.max(0.01, profile.burst.amount),
      parallel: clamp(Math.floor(profile.burst.parallel), 1, limits.maxBurstParallel),
    },
  };
}

export function resolvePreset(
  id: LoadPresetId,
  limits: LoadLimits,
  serverPresets?: Record<LoadPresetId, LoadProfile>,
): LoadProfile {
  const raw = serverPresets?.[id] ?? FALLBACK_PRESETS[id];
  return clampLoadProfile({ ...raw, name: id }, limits);
}

export function profileValidationErrors(profile: LoadProfile, limits: LoadLimits): string[] {
  const errors: string[] = [];
  if (profile.users > limits.maxUsers) errors.push(`Users cannot exceed ${limits.maxUsers}.`);
  if (profile.orders.count > limits.maxOrders) errors.push(`Orders cannot exceed ${limits.maxOrders}.`);
  if (profile.concurrency > limits.maxConcurrency) {
    errors.push(`Concurrency cannot exceed ${limits.maxConcurrency}.`);
  }
  if (profile.thinkTimeMs > limits.maxThinkTimeMs) {
    errors.push(`Think time cannot exceed ${limits.maxThinkTimeMs}ms.`);
  }
  if (profile.burst.parallel > limits.maxBurstParallel) {
    errors.push(`Burst parallel cannot exceed ${limits.maxBurstParallel}.`);
  }
  const payments = estimatePaymentOps(profile);
  if (payments > limits.maxPayments) {
    errors.push(`Derived payments (${payments}) exceed max ${limits.maxPayments}. Lower order count or partial fraction.`);
  }
  const totalOps = estimateTotalOps(profile);
  if (totalOps > limits.maxTotalOps) {
    errors.push(`Estimated total ops (${totalOps}) exceed max ${limits.maxTotalOps}.`);
  }
  return errors;
}
