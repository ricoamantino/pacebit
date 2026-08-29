import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  cancelStoredSession,
  finishStoredSession,
  observeStoredTimerState,
  pauseStoredSession,
  readStoredTimerState,
  resumeStoredSession,
  type StoredTimerStateObservation,
  startStoredSession,
} from '../../src/storage/session-storage';
import type { PausedSession, RunningSession } from '../../src/timer/session';

const startInput = {
  id: 'session-1',
  task: { id: 'task-1', title: 'Preparar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
} as const;

const runningSession: RunningSession = {
  ...startInput,
  state: 'running',
  periods: [],
  runningSinceMs: 1_000,
};

const pausedSession: PausedSession = {
  ...startInput,
  state: 'paused',
  periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
};

beforeEach(() => {
  fakeBrowser.reset();
});

describe('session coordination', () => {
  it('allows exactly one of two simultaneous starts to win', async () => {
    const secondInput = {
      ...startInput,
      id: 'session-2',
      task: { id: 'task-2', title: 'Revisar relatório' },
    } as const;

    const [first, second] = await contend(
      () => startStoredSession(null, startInput),
      () => startStoredSession(null, secondInput),
    );

    expect(first).toEqual({ status: 'applied', value: runningSession });
    expect(second).toMatchObject({
      status: 'conflict',
      reason: 'stale-state',
      state: { activeSession: runningSession, history: [] },
    });
    await expect(readStoredTimerState()).resolves.toEqual({
      status: 'ready',
      value: { activeSession: runningSession, history: [] },
    });
  });

  it('does not duplicate or lose a period during simultaneous pauses', async () => {
    await storage.setItem('local:active-session', runningSession);

    const [first, second] = await contend(
      () => pauseStoredSession(runningSession, 2_000),
      () => pauseStoredSession(runningSession, 3_000),
    );

    expect(first).toEqual({ status: 'applied', value: pausedSession });
    expect(second).toMatchObject({
      status: 'conflict',
      reason: 'stale-state',
      state: { activeSession: pausedSession },
    });
  });

  it('does not lose a confirmed period during simultaneous resumes', async () => {
    await storage.setItem('local:active-session', pausedSession);
    const resumed = { ...pausedSession, state: 'running', runningSinceMs: 3_000 } as const;

    const [first, second] = await contend(
      () => resumeStoredSession(pausedSession, 3_000),
      () => resumeStoredSession(pausedSession, 4_000),
    );

    expect(first).toEqual({ status: 'applied', value: resumed });
    expect(second).toMatchObject({
      status: 'conflict',
      reason: 'stale-state',
      state: { activeSession: resumed },
    });
  });

  it('creates one historical record during simultaneous finishes', async () => {
    await storage.setItem('local:active-session', runningSession);

    const [first, second] = await contend(
      () => finishStoredSession(runningSession, 2_000),
      () => finishStoredSession(runningSession, 3_000),
    );

    expect(first).toMatchObject({ status: 'applied', value: { endedAtMs: 2_000 } });
    expect(second).toMatchObject({
      status: 'conflict',
      reason: 'stale-state',
      state: { activeSession: null },
    });
    await expect(readStoredTimerState()).resolves.toMatchObject({
      status: 'ready',
      value: { activeSession: null, history: [{ id: startInput.id, endedAtMs: 2_000 }] },
    });
  });

  it('allows exactly one of two simultaneous cancellations to win', async () => {
    await storage.setItem('local:active-session', pausedSession);

    const [first, second] = await contend(
      () => cancelStoredSession(pausedSession),
      () => cancelStoredSession(pausedSession),
    );

    expect(first).toEqual({ status: 'applied', value: null });
    expect(second).toMatchObject({
      status: 'conflict',
      reason: 'stale-state',
      state: { activeSession: null, history: [] },
    });
  });

  it.each<[string, () => Promise<unknown>]>([
    ['pause', () => pauseStoredSession(runningSession, 3_000)],
    ['cancel', () => cancelStoredSession(runningSession)],
  ])('keeps a confirmed finish when contending with %s', async (_action, contender) => {
    await storage.setItem('local:active-session', runningSession);

    const [finish, competingResult] = await contend(
      () => finishStoredSession(runningSession, 2_000),
      contender,
    );

    expect(finish).toMatchObject({ status: 'applied' });
    expect(competingResult).toMatchObject({ status: 'conflict', reason: 'stale-state' });
    await expect(readStoredTimerState()).resolves.toMatchObject({
      status: 'ready',
      value: { activeSession: null, history: [{ id: startInput.id }] },
    });
  });

  it('rejects a command whose full observed state is stale', async () => {
    const changedEarlierPeriod: RunningSession = {
      ...runningSession,
      periods: [{ startedAtMs: 1_000, endedAtMs: 1_500 }],
      runningSinceMs: 2_000,
    };
    const staleSession: RunningSession = {
      ...changedEarlierPeriod,
      periods: [{ startedAtMs: 1_000, endedAtMs: 1_250 }],
    };
    await storage.setItem('local:active-session', changedEarlierPeriod);

    await expect(pauseStoredSession(staleSession, 3_000)).resolves.toMatchObject({
      status: 'conflict',
      reason: 'stale-state',
      state: { activeSession: changedEarlierPeriod },
    });
  });

  it('blocks every non-finish mutation while finalization cleanup is pending', async () => {
    const completedRunning = {
      ...startInput,
      endedAtMs: 2_000,
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      durationMs: 1_000,
    } as const;
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', [completedRunning]);

    await expect(pauseStoredSession(runningSession, 3_000)).resolves.toMatchObject({
      status: 'conflict',
      reason: 'finalization-pending',
    });
    await expect(cancelStoredSession(runningSession)).resolves.toMatchObject({
      status: 'conflict',
      reason: 'finalization-pending',
    });

    const completedPaused = { ...completedRunning, endedAtMs: 3_000 };
    await storage.setItem('local:active-session', pausedSession);
    await storage.setItem('local:session-history', [completedPaused]);

    await expect(resumeStoredSession(pausedSession, 4_000)).resolves.toMatchObject({
      status: 'conflict',
      reason: 'finalization-pending',
    });
    await expect(cancelStoredSession(pausedSession)).resolves.toMatchObject({
      status: 'conflict',
      reason: 'finalization-pending',
    });
  });

  it('preserves incompatible completion data and blocks every mutation', async () => {
    const incompatibleHistory = [
      {
        ...startInput,
        endedAtMs: 2_000,
        periods: [{ startedAtMs: 1_000, endedAtMs: 1_500 }],
        durationMs: 500,
      },
    ];
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', incompatibleHistory);

    await expect(pauseStoredSession(runningSession, 2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-stored-data',
    });
    await expect(cancelStoredSession(runningSession)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-stored-data',
    });
    await expect(storage.snapshot('local')).resolves.toEqual({
      'active-session': runningSession,
      'session-history': incompatibleHistory,
    });
  });

  it('reuses a pending completion without validating a new timestamp', async () => {
    const completed = {
      ...startInput,
      endedAtMs: 2_000,
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      durationMs: 1_000,
    } as const;
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', [completed]);

    await expect(finishStoredSession(runningSession, -1)).resolves.toEqual({
      status: 'applied',
      value: completed,
    });
    await expect(readStoredTimerState()).resolves.toEqual({
      status: 'ready',
      value: { activeSession: null, history: [completed] },
    });
  });

  it('rejects an ID that already belongs to history', async () => {
    const completed = {
      ...startInput,
      endedAtMs: 2_000,
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      durationMs: 1_000,
    } as const;
    await storage.setItem('local:session-history', [completed]);

    await expect(startStoredSession(null, startInput)).resolves.toEqual({
      status: 'rejected',
      reason: 'session-id-conflict',
    });
    await expect(storage.snapshot('local')).resolves.toEqual({
      'session-history': [completed],
    });
  });

  it('makes observers converge and stops notifications after unsubscribe', async () => {
    const firstObservations: StoredTimerStateObservation[] = [];
    const secondObservations: StoredTimerStateObservation[] = [];
    const stopFirst = observeStoredTimerState((state) => firstObservations.push(state));
    const stopSecond = observeStoredTimerState((state) => secondObservations.push(state));

    await vi.waitFor(() => {
      expect(firstObservations.at(-1)).toEqual({
        status: 'ready',
        value: { activeSession: null, history: [] },
      });
      expect(secondObservations.at(-1)).toEqual(firstObservations.at(-1));
    });

    await startStoredSession(null, startInput);

    await vi.waitFor(() => {
      expect(firstObservations.at(-1)).toMatchObject({
        status: 'ready',
        value: { activeSession: runningSession },
      });
      expect(secondObservations.at(-1)).toEqual(firstObservations.at(-1));
    });

    stopFirst();
    const firstCount = firstObservations.length;
    await pauseStoredSession(runningSession, 2_000);

    await vi.waitFor(() => {
      expect(secondObservations.at(-1)).toMatchObject({
        status: 'ready',
        value: { activeSession: pausedSession },
      });
    });
    expect(firstObservations).toHaveLength(firstCount);
    stopSecond();
  });

  it('does not expose the successful finalization between its two writes', async () => {
    await storage.setItem('local:active-session', runningSession);
    const observations: StoredTimerStateObservation[] = [];
    const stop = observeStoredTimerState((state) => observations.push(state));

    await vi.waitFor(() =>
      expect(observations.at(-1)).toMatchObject({
        status: 'ready',
        value: { activeSession: runningSession, history: [] },
      }),
    );

    await finishStoredSession(runningSession, 2_000);

    await vi.waitFor(() =>
      expect(observations.at(-1)).toMatchObject({
        status: 'ready',
        value: { activeSession: null, history: [{ id: startInput.id }] },
      }),
    );
    expect(
      observations.some(
        (observation) =>
          observation.status === 'ready' &&
          observation.value.activeSession !== null &&
          observation.value.history.length > 0,
      ),
    ).toBe(false);
    stop();
  });

  it('reports invalid and unavailable observations without exposing errors', async () => {
    const invalidObservations: StoredTimerStateObservation[] = [];
    await storage.setItem('local:active-session', { ...runningSession, runningSinceMs: -1 });
    const stopInvalid = observeStoredTimerState((state) => invalidObservations.push(state));

    await vi.waitFor(() => expect(invalidObservations.at(-1)).toEqual({ status: 'invalid' }));
    stopInvalid();

    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('sensitive controlled failure'),
    );
    const failedObservations: StoredTimerStateObservation[] = [];
    const stopFailed = observeStoredTimerState((state) => failedObservations.push(state));

    await vi.waitFor(() =>
      expect(failedObservations.at(-1)).toEqual({
        status: 'failed',
        reason: 'storage-unavailable',
      }),
    );
    stopFailed();
  });

  it('fails closed when Web Locks is unavailable', async () => {
    vi.spyOn(globalThis.navigator, 'locks', 'get').mockReturnValue(undefined as never);

    await expect(startStoredSession(null, startInput)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(storage.snapshot('local')).resolves.toEqual({});
  });
});

async function contend<T, U>(first: () => Promise<T>, second: () => Promise<U>): Promise<[T, U]> {
  const originalGet = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
  const firstReadStarted = Promise.withResolvers<void>();
  const releaseFirstRead = Promise.withResolvers<void>();
  const getSpy = vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(async () => {
    firstReadStarted.resolve();
    await releaseFirstRead.promise;
    return originalGet();
  });

  const firstResult = first();
  await firstReadStarted.promise;
  const secondResult = second();

  expect(getSpy).toHaveBeenCalledTimes(2);
  releaseFirstRead.resolve();

  return Promise.all([firstResult, secondResult]);
}
