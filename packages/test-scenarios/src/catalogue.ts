import type { Scenario, Suite } from './types';
import {
  amountEdges,
  assignmentSample,
  authorizationIsolation,
  concurrencyRace,
  editability,
  idempotencyReplay,
  idempotencyWrongOrder,
  overpaymentRejected,
  paymentAllocation,
  refundHappyPath,
  statusTransitions,
  validationErrors,
} from './suites/payments';

const ALL_SCENARIOS: Scenario[] = [
  assignmentSample,
  paymentAllocation,
  amountEdges,
  statusTransitions,
  overpaymentRejected,
  concurrencyRace,
  idempotencyReplay,
  idempotencyWrongOrder,
  authorizationIsolation,
  editability,
  refundHappyPath,
  validationErrors,
];

const SUITE_META: Record<string, { title: string; description: string }> = {
  assignment: {
    title: 'Assignment sample',
    description: 'The $1,000 → $400 → $600 → reject overpay walkthrough from the brief.',
  },
  allocation: {
    title: 'Payment allocation',
    description: 'Partial and multi-payment allocation of paid / due.',
  },
  amounts: {
    title: 'Amount edge cases',
    description: 'Minimum amount, zero, and negative rejection.',
  },
  status: {
    title: 'Status transitions',
    description: 'Derived status including overdue vs paid priority.',
  },
  overpayment: {
    title: 'Over-payment rejection',
    description: 'Payments above remaining balance are rejected without changing paid.',
  },
  concurrency: {
    title: 'Concurrency',
    description: 'Guarded UPDATE under simultaneous payment requests.',
  },
  idempotency: {
    title: 'Idempotency',
    description: 'Idempotency-Key replay and cross-order key reuse.',
  },
  authorization: {
    title: 'Authorization',
    description: 'Users cannot access another user’s orders.',
  },
  editability: {
    title: 'Order editability',
    description: 'Financial fields lock after the first payment.',
  },
  refunds: {
    title: 'Refunds',
    description: 'Separate refund entity, over-refund rejection, re-edit after full refund.',
  },
  validation: {
    title: 'Validation',
    description: 'Malformed order payloads are rejected.',
  },
};

export function getAllScenarios(): Scenario[] {
  return ALL_SCENARIOS;
}

export function getSuites(): Suite[] {
  const bySuite = new Map<string, Scenario[]>();
  for (const scenario of ALL_SCENARIOS) {
    const list = bySuite.get(scenario.suite) ?? [];
    list.push(scenario);
    bySuite.set(scenario.suite, list);
  }

  return [...bySuite.entries()].map(([id, scenarios]) => ({
    id,
    title: SUITE_META[id]?.title ?? id,
    description: SUITE_META[id]?.description ?? '',
    scenarios,
  }));
}

export function getScenarios(suiteIds?: string[]): Scenario[] {
  if (!suiteIds || suiteIds.length === 0) return ALL_SCENARIOS;
  const wanted = new Set(suiteIds);
  return ALL_SCENARIOS.filter((s) => wanted.has(s.suite) || wanted.has(s.id));
}
