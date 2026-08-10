import { randomUUID } from 'crypto';
import { getScenarios } from '@oas/test-scenarios';
import { cleanupUsers } from '../../engine/cleanup';
import { createRunUsers, executeScenario, type ScenarioResult, type StepResult } from '../../engine/scenarioExecutor';
import {
  appendEvent,
  getRun,
  markSuiteActive,
  markSuiteInactive,
  saveRun,
  type SuiteRunRecord,
} from '../../engine/runStore';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/** Map executor step results to the wire shape consumed by test-web. */
export function toWireStep(step: StepResult): Record<string, unknown> {
  return {
    name: step.name,
    kind: step.kind,
    // Send both so live UI and snapshot hydration stay compatible.
    status: step.passed ? ('passed' as const) : ('failed' as const),
    passed: step.passed,
    durationMs: step.durationMs,
    request: step.request,
    response: step.response,
    assertions: step.assertions,
    error: step.error,
    phase: step.phase,
    parallelSummary: step.parallelSummary,
    children: step.children?.map(toWireStep),
  };
}

function toWireScenario(result: ScenarioResult) {
  return {
    id: result.id,
    suite: result.suite,
    title: result.title,
    rule: result.rule,
    passed: result.passed,
    durationMs: result.durationMs,
    error: result.error,
    steps: result.steps.map(toWireStep),
  };
}

export async function startSuiteRun(suites?: string[]): Promise<SuiteRunRecord> {
  const runId = randomUUID();
  const now = new Date().toISOString();
  const run: SuiteRunRecord = {
    id: runId,
    kind: 'suite',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    suites,
    scenarios: [],
    events: [],
  };
  await saveRun(run);
  await markSuiteActive(runId);

  void executeSuiteRun(runId, suites).catch((err) => {
    logger.error({ err, runId }, 'Suite run crashed');
  });

  return run;
}

async function executeSuiteRun(runId: string, suites?: string[]): Promise<void> {
  const run = (await getRun(runId)) as SuiteRunRecord | null;
  if (!run) return;

  run.status = 'running';
  await saveRun(run);

  const scenarios = getScenarios(suites);
  const suiteIds = [...new Set(scenarios.map((s) => s.suite))];
  const needsSecond = scenarios.some((s) => s.needsSecondUser);
  const userIds: string[] = [];

  await appendEvent(runId, {
    type: 'run.started',
    runId,
    at: new Date().toISOString(),
    suites: suiteIds,
    totalScenarios: scenarios.length,
    apiBaseUrl: env.PUBLIC_API_BASE_URL,
  });

  const started = Date.now();

  try {
    const users = await createRunUsers(needsSecond);
    userIds.push(users.primary.userId);
    if (users.secondary) userIds.push(users.secondary.userId);

    for (const scenario of scenarios) {
      await appendEvent(runId, {
        type: 'scenario.started',
        runId,
        at: new Date().toISOString(),
        suiteId: scenario.suite,
        scenarioId: scenario.id,
        title: scenario.title,
        rule: scenario.rule,
      });

      const result = await executeScenario(scenario, users.primary.accessToken, {
        secondUserToken: users.secondary?.accessToken,
        hooks: {
          onStepStarted: async (stepName, stepIndex) => {
            await appendEvent(runId, {
              type: 'step.started',
              runId,
              at: new Date().toISOString(),
              suiteId: scenario.suite,
              scenarioId: scenario.id,
              stepName,
              stepIndex,
            });
          },
          onStepFinished: async (step, stepIndex) => {
            await appendEvent(runId, {
              type: 'step.finished',
              runId,
              at: new Date().toISOString(),
              suiteId: scenario.suite,
              scenarioId: scenario.id,
              stepIndex,
              step: toWireStep(step),
            });
          },
        },
      });

      await appendEvent(runId, {
        type: 'scenario.finished',
        runId,
        at: new Date().toISOString(),
        suiteId: scenario.suite,
        scenarioId: scenario.id,
        status: result.passed ? 'passed' : 'failed',
        durationMs: result.durationMs,
        // Full step tree (incl. parallel children) so the UI can render race details
        // even if an earlier step.finished frame was thin or missed.
        steps: result.steps.map(toWireStep),
      });

      const current = (await getRun(runId)) as SuiteRunRecord;
      // Store wire-shaped steps so run.snapshot already has parallel children.
      current.scenarios.push(toWireScenario(result) as unknown as ScenarioResult);
      await saveRun(current);
    }

    const final = (await getRun(runId)) as SuiteRunRecord;
    const passed = final.scenarios.filter((s) => s.passed).length;
    const failed = final.scenarios.length - passed;
    const elapsedMs = Date.now() - started;
    final.status = 'finished';
    final.summary = {
      total: final.scenarios.length,
      passed,
      failed,
      durationMs: elapsedMs,
    };
    await saveRun(final);

    await appendEvent(runId, {
      type: 'run.finished',
      runId,
      at: new Date().toISOString(),
      status: failed > 0 ? 'failed' : 'passed',
      summary: {
        total: final.scenarios.length,
        passed,
        failed,
        skipped: 0,
        elapsedMs,
        apiBaseUrl: env.PUBLIC_API_BASE_URL,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const final = (await getRun(runId)) as SuiteRunRecord;
    final.status = 'failed';
    final.error = message;
    await saveRun(final);
    await appendEvent(runId, {
      type: 'run.error',
      runId,
      at: new Date().toISOString(),
      message,
    });
  } finally {
    await cleanupUsers({ userIds, emailPrefixes: ['testrun+'] });
    await markSuiteInactive(runId);
  }
}
