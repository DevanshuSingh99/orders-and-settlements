import type { Assertion } from './types';

/** Resolve a dotted path like "data.order.due" against a JSON value. */
export function getByPath(value: unknown, path: string): unknown {
  if (!path) return value;
  const parts = path.split('.');
  let current: unknown = value;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export interface AssertionResult {
  path: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export function runAssertions(body: unknown, assertions: Assertion[] = []): AssertionResult[] {
  return assertions.map(([path, expected]) => {
    const actual = getByPath(body, path);
    const passed = Object.is(actual, expected) || (actual === expected);
    // Deep-ish equality for plain objects/arrays via JSON (good enough for API envelopes).
    const deepPassed =
      passed ||
      (typeof expected === 'object' &&
        expected !== null &&
        JSON.stringify(actual) === JSON.stringify(expected));
    return { path, expected, actual, passed: deepPassed };
  });
}

/** Replace `{orderId}` style tokens using a string capture map. */
export function interpolate(template: string, captures: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    if (captures[key] === undefined) {
      throw new Error(`Missing capture "{${key}}" while interpolating "${template}"`);
    }
    return captures[key];
  });
}

export function interpolateUnknown(value: unknown, captures: Record<string, string>): unknown {
  if (typeof value === 'string') return interpolate(value, captures);
  if (Array.isArray(value)) return value.map((item) => interpolateUnknown(item, captures));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateUnknown(v, captures);
    }
    return out;
  }
  return value;
}
