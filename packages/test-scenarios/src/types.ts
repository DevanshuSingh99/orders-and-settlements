/**
 * Framework-free scenario definitions consumed by test-runner-service.
 * No Jest imports — the UI can render these and the runner can execute them.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** JSON-path assertion: path like "data.total" or "error.code". */
export type Assertion = [path: string, expected: unknown];

export interface HttpRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** When set, use this capture as Bearer token instead of the primary user. */
  asUser?: string;
}

export interface HttpStep {
  kind?: 'http';
  name: string;
  request: HttpRequest;
  expect: {
    status: number;
    assert?: Assertion[];
  };
  /** Capture response values into the run context, e.g. { orderId: 'data.id' }. */
  capture?: Record<string, string>;
}

export interface ParallelStep {
  kind: 'parallel';
  name: string;
  steps: HttpStep[];
  expect: {
    successCount: number;
    failureCount: number;
  };
  after?: HttpStep[];
}

export type Step = HttpStep | ParallelStep;

export interface Scenario {
  id: string;
  suite: string;
  title: string;
  rule: string;
  steps: Step[];
  needsSecondUser?: boolean;
}

export interface Suite {
  id: string;
  title: string;
  description: string;
  scenarios: Scenario[];
}
