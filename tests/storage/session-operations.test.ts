import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  cancelStoredSession,
  finishStoredSession,
  pauseStoredSession,
  readActiveSession,
  readSessionHistory,
  resumeStoredSession,
  startStoredSession,
} from '../../src/storage/session-storage';

const startInput = {
  id: 'session-1',
  task: { id: 'task-1', title: 'Preparar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
} as const;

const runningSession = {
  ...startInput,
  state: 'running',
  periods: [],
  runningSinceMs: 1_000,
} as const;

const pausedSession = {
  ...startInput,
  state: 'paused',
  periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
} as const;

beforeEach(() => {
  fakeBrowser.reset();
});

describe('stored session operations', () => {
  it('persists start, pause, resume and finish before reporting each transition', async () => {
    await expect(startStoredSession(startInput)).resolves.toEqual({
      status: 'applied',
      value: runningSession,
    });

    await expect(pauseStoredSession(2_000)).resolves.toEqual({
      status: 'applied',
      value: pausedSession,
    });

    await expect(resumeStoredSession(3_000)).resolves.toEqual({
      status: 'applied',
      value: {
        ...pausedSession,
        state: 'running',
        runningSinceMs: 3_000,
      },
    });

    const originalRemove = fakeBrowser.storage.local.remove.bind(fakeBrowser.storage.local);
    const removeSpy = vi
      .spyOn(fakeBrowser.storage.local, 'remove')
      .mockImplementation(async (keys) => {
        const snapshot = await storage.snapshot('local');
        expect(snapshot['session-history']).toEqual([
          {
            ...startInput,
            endedAtMs: 4_000,
            periods: [
              { startedAtMs: 1_000, endedAtMs: 2_000 },
              { startedAtMs: 3_000, endedAtMs: 4_000 },
            ],
            durationMs: 2_000,
          },
        ]);
        await originalRemove(keys);
      });

    await expect(finishStoredSession(4_000)).resolves.toEqual({
      status: 'applied',
      value: {
        ...startInput,
        endedAtMs: 4_000,
        periods: [
          { startedAtMs: 1_000, endedAtMs: 2_000 },
          { startedAtMs: 3_000, endedAtMs: 4_000 },
        ],
        durationMs: 2_000,
      },
    });

    expect(removeSpy).toHaveBeenCalledOnce();
    await expect(readActiveSession()).resolves.toEqual({ status: 'ready', value: null });
    await expect(readSessionHistory()).resolves.toEqual({
      status: 'ready',
      value: [
        {
          ...startInput,
          endedAtMs: 4_000,
          periods: [
            { startedAtMs: 1_000, endedAtMs: 2_000 },
            { startedAtMs: 3_000, endedAtMs: 4_000 },
          ],
          durationMs: 2_000,
        },
      ],
    });
  });

  it('removes a canceled session without changing history', async () => {
    const existingHistory = [
      {
        ...startInput,
        id: 'historical-session',
        endedAtMs: 2_000,
        periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
        durationMs: 1_000,
      },
    ];
    await storage.setItem('local:active-session', pausedSession);
    await storage.setItem('local:session-history', existingHistory);
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');

    await expect(cancelStoredSession()).resolves.toEqual({ status: 'applied', value: null });
    expect(setSpy).not.toHaveBeenCalled();
    await expect(readActiveSession()).resolves.toEqual({ status: 'ready', value: null });
    await expect(readSessionHistory()).resolves.toEqual({
      status: 'ready',
      value: existingHistory,
    });

    const removeSpy = vi.spyOn(fakeBrowser.storage.local, 'remove');
    await expect(cancelStoredSession()).resolves.toEqual({ status: 'unchanged', value: null });
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('does not write rejected or already satisfied transitions', async () => {
    await storage.setItem('local:active-session', runningSession);
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    const removeSpy = vi.spyOn(fakeBrowser.storage.local, 'remove');

    await expect(startStoredSession(startInput)).resolves.toEqual({
      status: 'unchanged',
      value: runningSession,
    });
    await expect(resumeStoredSession(2_000)).resolves.toEqual({
      status: 'unchanged',
      value: runningSession,
    });
    await expect(pauseStoredSession(999)).resolves.toEqual({
      status: 'rejected',
      reason: 'timestamp-out-of-order',
    });

    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('does not report an applied transition before its write resolves', async () => {
    const write = Promise.withResolvers<void>();
    const setSpy = vi
      .spyOn(fakeBrowser.storage.local, 'set')
      .mockImplementationOnce(() => write.promise);
    let settled = false;

    const pendingResult = startStoredSession(startInput);
    void pendingResult.then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(setSpy).toHaveBeenCalledOnce());
    expect(settled).toBe(false);

    write.resolve();
    await expect(pendingResult).resolves.toMatchObject({ status: 'applied' });
  });

  it('preserves absence when starting cannot be written', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('controlled write failure'),
    );

    await expect(startStoredSession(startInput)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(readActiveSession()).resolves.toEqual({ status: 'ready', value: null });
  });

  it('sanitizes storage read failures', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('controlled read failure'),
    );

    await expect(pauseStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
  });

  it('preserves a running session when pause cannot be written', async () => {
    await storage.setItem('local:active-session', runningSession);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('controlled write failure'),
    );

    await expect(pauseStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: runningSession,
    });
  });

  it('preserves a paused session when resume cannot be written', async () => {
    await storage.setItem('local:active-session', pausedSession);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('controlled write failure'),
    );

    await expect(resumeStoredSession(3_000)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: pausedSession,
    });
  });

  it('preserves session and history when cancellation removal fails', async () => {
    await storage.setItem('local:active-session', pausedSession);
    await storage.setItem('local:session-history', []);
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValueOnce(
      new Error('controlled remove failure'),
    );

    await expect(cancelStoredSession()).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: pausedSession,
    });
    await expect(readSessionHistory()).resolves.toEqual({ status: 'ready', value: [] });
  });

  it('preserves the active session when history cannot be written', async () => {
    await storage.setItem('local:active-session', runningSession);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('controlled history failure'),
    );

    await expect(finishStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: runningSession,
    });
    await expect(readSessionHistory()).resolves.toEqual({ status: 'ready', value: [] });
  });

  it('retries interrupted cleanup without duplicating or extending history', async () => {
    await storage.setItem('local:active-session', runningSession);
    const removeSpy = vi
      .spyOn(fakeBrowser.storage.local, 'remove')
      .mockRejectedValueOnce(new Error('controlled remove failure'));

    await expect(finishStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: runningSession,
    });

    const firstHistory = await readSessionHistory();
    expect(firstHistory).toEqual({
      status: 'ready',
      value: [
        {
          ...startInput,
          endedAtMs: 2_000,
          periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
          durationMs: 1_000,
        },
      ],
    });

    await expect(finishStoredSession(5_000)).resolves.toEqual({
      status: 'applied',
      value: firstHistory.status === 'ready' ? firstHistory.value[0] : undefined,
    });
    expect(removeSpy).toHaveBeenCalledTimes(2);
    await expect(readActiveSession()).resolves.toEqual({ status: 'ready', value: null });
    await expect(readSessionHistory()).resolves.toEqual(firstHistory);
  });

  it('preserves incompatible records that reuse the active session ID', async () => {
    const incompatibleHistory = [
      {
        ...startInput,
        endedAtMs: 2_000,
        periods: [
          { startedAtMs: 1_000, endedAtMs: 1_500 },
          { startedAtMs: 1_600, endedAtMs: 2_000 },
        ],
        durationMs: 900,
      },
    ];
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', incompatibleHistory);
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    const removeSpy = vi.spyOn(fakeBrowser.storage.local, 'remove');

    await expect(finishStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-stored-data',
    });
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    await expect(storage.snapshot('local')).resolves.toEqual({
      'active-session': runningSession,
      'session-history': incompatibleHistory,
    });
  });

  it('reports quota failures without replacing the stored session', async () => {
    await storage.setItem('local:active-session', runningSession);
    const quotaError = new Error('QUOTA_BYTES quota exceeded');
    quotaError.name = 'QuotaExceededError';
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(quotaError);

    await expect(pauseStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'quota-exceeded',
    });
    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: runningSession,
    });
  });

  it('blocks mutations when stored data is invalid', async () => {
    const invalidSession = { ...runningSession, runningSinceMs: -1 };
    await storage.setItem('local:active-session', invalidSession);
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    const removeSpy = vi.spyOn(fakeBrowser.storage.local, 'remove');

    await expect(pauseStoredSession(2_000)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-stored-data',
    });
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    await expect(storage.snapshot('local')).resolves.toEqual({
      'active-session': invalidSession,
    });
  });

  it('recovers state from local storage after recreating the module context', async () => {
    await startStoredSession(startInput);
    await finishStoredSession(2_000);
    const secondInput = {
      id: 'session-2',
      task: { id: 'task-2', title: 'Revisar relatório' },
      taskList: startInput.taskList,
      startedAtMs: 3_000,
    } as const;
    await startStoredSession(secondInput);
    vi.resetModules();

    const recreatedStorage = await import('../../src/storage/session-storage');

    await expect(recreatedStorage.readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: {
        ...secondInput,
        state: 'running',
        periods: [],
        runningSinceMs: 3_000,
      },
    });
    await expect(recreatedStorage.readSessionHistory()).resolves.toEqual({
      status: 'ready',
      value: [
        {
          ...startInput,
          endedAtMs: 2_000,
          periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
          durationMs: 1_000,
        },
      ],
    });
  });

  it('keeps local operations independent from remote availability', async () => {
    await storage.setItem('local:active-session', runningSession);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('controlled offline state'));

    await expect(pauseStoredSession(2_000)).resolves.toMatchObject({ status: 'applied' });
    await expect(resumeStoredSession(3_000)).resolves.toMatchObject({ status: 'applied' });
    await expect(finishStoredSession(4_000)).resolves.toMatchObject({ status: 'applied' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
