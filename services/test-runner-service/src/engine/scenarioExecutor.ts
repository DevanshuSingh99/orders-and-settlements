import {
  getByPath,
  interpolate,
  interpolateUnknown,
  runAssertions,
  type AssertionResult,
  type HttpStep,
  type ParallelStep,
  type Scenario,
  type Step,
} from '@oas/test-scenarios';
import { apiFetch, registerEphemeralUser } from './apiClient';
import { redact } from './redact';

export interface StepResult {
  name: string;
  kind: 'http' | 'parallel';
  passed: boolean;
  durationMs: number;
  request?: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
  response?: {
    status: number;
    body: unknown;
  };
  assertions?: AssertionResult[];
  error?: string;
  children?: StepResult[];
  parallelSummary?: { successCount: number; failureCount: number; expectedSuccess: number; expectedFailure: number };
}

export interface ScenarioResult {
  id: string;
  suite: string;
  title: string;
  rule: string;
  passed: boolean;
  durationMs: number;
  steps: StepResult[];
  error?: string;
}

function captureStrings(body: unknown, capture: Record<string, string> | undefined, into: Record<string, string>): void {
  if (!capture) return;
  for (const [key, path] of Object.entries(capture)) {
    const value = getByPath(body, path);
    if (value === undefined || value === null) {
      throw new Error(`Capture "${key}" from path "${path}" was empty`);
    }
    into[key] = String(value);
  }
}

async function executeHttpStep(
  step: HttpStep,
  captures: Record<string, string>,
  defaultToken: string,
): Promise<StepResult> {
  const started = Date.now();
  try {
    const path = interpolate(step.request.path, captures);
    const body = step.request.body !== undefined ? interpolateUnknown(step.request.body, captures) : undefined;
    const headers = step.request.headers
      ? (interpolateUnknown(step.request.headers, captures) as Record<string, string>)
      : undefined;

    let accessToken = defaultToken;
    if (step.request.asUser) {
      const alt = captures[step.request.asUser];
      if (!alt) throw new Error(`Missing capture for asUser "${step.request.asUser}"`);
      accessToken = alt;
    }

    const res = await apiFetch({
      method: step.request.method,
      path,
      body,
      headers,
      accessToken,
    });

    const expectedAsserts = (step.expect.assert ?? []).map(
      ([p, expected]) => [p, interpolateUnknown(expected, captures)] as [string, unknown],
    );
    const assertions = runAssertions(res.body, expectedAsserts);
    const statusOk = res.status === step.expect.status;
    const assertsOk = assertions.every((a) => a.passed);
    const passed = statusOk && assertsOk;

    captureStrings(res.body, step.capture, captures);

    return {
      name: step.name,
      kind: 'http',
      passed,
      durationMs: Date.now() - started,
      request: { method: step.request.method, path, body: redact(body), headers: redact(headers) as Record<string, string> | undefined },
      response: { status: res.status, body: redact(res.body) },
      assertions: [
        {
          path: 'status',
          expected: step.expect.status,
          actual: res.status,
          passed: statusOk,
        },
        ...assertions,
      ],
      error: passed
        ? undefined
        : !statusOk
          ? `Expected status ${step.expect.status}, got ${res.status}`
          : 'Assertion failed',
    };
  } catch (err) {
    return {
      name: step.name,
      kind: 'http',
      passed: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeParallelStep(
  step: ParallelStep,
  captures: Record<string, string>,
  defaultToken: string,
): Promise<StepResult> {
  const started = Date.now();
  const children = await Promise.all(step.steps.map((s) => executeHttpStep(s, captures, defaultToken)));
  const successCount = children.filter((c) => c.passed).length;
  const failureCount = children.length - successCount;
  const countsOk =
    successCount === step.expect.successCount && failureCount === step.expect.failureCount;

  const afterResults: StepResult[] = [];
  if (step.after) {
    for (const after of step.after) {
      afterResults.push(await executeHttpStep(after, captures, defaultToken));
    }
  }

  const afterOk = afterResults.every((r) => r.passed);
  const passed = countsOk && afterOk;

  return {
    name: step.name,
    kind: 'parallel',
    passed,
    durationMs: Date.now() - started,
    children: [...children, ...afterResults],
    parallelSummary: {
      successCount,
      failureCount,
      expectedSuccess: step.expect.successCount,
      expectedFailure: step.expect.failureCount,
    },
    error: passed
      ? undefined
      : !countsOk
        ? `Expected ${step.expect.successCount} success / ${step.expect.failureCount} failure, got ${successCount}/${failureCount}`
        : 'Follow-up step failed',
  };
}

async function executeStep(
  step: Step,
  captures: Record<string, string>,
  defaultToken: string,
): Promise<StepResult> {
  if (step.kind === 'parallel') {
    return executeParallelStep(step, captures, defaultToken);
  }
  return executeHttpStep(step, captures, defaultToken);
}

export interface ScenarioHooks {
  onStepStarted?: (stepName: string, stepIndex: number) => void | Promise<void>;
  onStepFinished?: (step: StepResult, stepIndex: number) => void | Promise<void>;
}

export async function executeScenario(
  scenario: Scenario,
  primaryToken: string,
  options?: { secondUserToken?: string; hooks?: ScenarioHooks },
): Promise<ScenarioResult> {
  const started = Date.now();
  const captures: Record<string, string> = {};
  if (options?.secondUserToken) {
    captures.userBToken = options.secondUserToken;
  }

  const steps: StepResult[] = [];
  let passed = true;
  let error: string | undefined;

  try {
    for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex += 1) {
      const step = scenario.steps[stepIndex];
      await options?.hooks?.onStepStarted?.(step.name, stepIndex);
      const result = await executeStep(step, captures, primaryToken);
      steps.push(result);
      await options?.hooks?.onStepFinished?.(result, stepIndex);
      if (!result.passed) {
        passed = false;
        error = result.error ?? `Step "${result.name}" failed`;
        break;
      }
    }
  } catch (err) {
    passed = false;
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    id: scenario.id,
    suite: scenario.suite,
    title: scenario.title,
    rule: scenario.rule,
    passed,
    durationMs: Date.now() - started,
    steps,
    error,
  };
}

export async function createRunUsers(needsSecondUser: boolean): Promise<{
  primary: Awaited<ReturnType<typeof registerEphemeralUser>>;
  secondary?: Awaited<ReturnType<typeof registerEphemeralUser>>;
}> {
  const primary = await registerEphemeralUser('testrun+');
  const secondary = needsSecondUser ? await registerEphemeralUser('testrun+') : undefined;
  return { primary, secondary };
}
