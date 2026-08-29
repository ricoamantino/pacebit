import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  findPendingSessionCompletion,
  readActiveSession,
  readSessionHistory,
  readStoredTimerState,
} from '../../src/storage/session-storage';

const runningSession = {
  id: 'session-running',
  task: { id: 'task-1', title: 'Preparar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
  state: 'running',
  periods: [],
  runningSinceMs: 1_000,
} as const;

const pausedSession = {
  id: 'session-paused',
  task: { id: 'task-2', title: 'Revisar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
  state: 'paused',
  periods: [
    { startedAtMs: 1_000, endedAtMs: 2_000 },
    { startedAtMs: 3_000, endedAtMs: 4_000 },
  ],
} as const;

const completedSession = {
  id: 'session-completed',
  task: { id: 'task-3', title: 'Enviar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
  endedAtMs: 5_000,
  periods: [
    { startedAtMs: 1_000, endedAtMs: 2_000 },
    { startedAtMs: 3_000, endedAtMs: 4_000 },
  ],
  durationMs: 2_000,
} as const;

beforeEach(() => {
  fakeBrowser.reset();
});

describe('session storage', () => {
  it('returns valid initial state without persisting fallbacks', async () => {
    await expect(readActiveSession()).resolves.toEqual({ status: 'ready', value: null });
    await expect(readSessionHistory()).resolves.toEqual({ status: 'ready', value: [] });

    await expect(storage.snapshot('local')).resolves.toEqual({});
    await expect(storage.snapshot('session')).resolves.toEqual({});
    await expect(storage.snapshot('sync')).resolves.toEqual({});
  });

  it('recovers a running session from local storage', async () => {
    await storage.setItem('local:active-session', runningSession);

    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: runningSession,
    });
  });

  it('recovers a paused session from local storage', async () => {
    await storage.setItem('local:active-session', pausedSession);

    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: pausedSession,
    });
  });

  it('recovers empty and filled history from local storage', async () => {
    await storage.setItem('local:session-history', []);
    await expect(readSessionHistory()).resolves.toEqual({ status: 'ready', value: [] });

    await storage.setItem('local:session-history', [completedSession]);
    await expect(readSessionHistory()).resolves.toEqual({
      status: 'ready',
      value: [completedSession],
    });
  });

  it('identifies a compatible completion awaiting active-session cleanup', async () => {
    const pendingCompletion = {
      id: runningSession.id,
      task: runningSession.task,
      taskList: runningSession.taskList,
      startedAtMs: runningSession.startedAtMs,
      endedAtMs: 2_000,
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      durationMs: 1_000,
    } as const;
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', [pendingCompletion]);

    const result = await readStoredTimerState();

    expect(result).toEqual({
      status: 'ready',
      value: { activeSession: runningSession, history: [pendingCompletion] },
    });
    expect(result.status === 'ready' && findPendingSessionCompletion(result.value)).toEqual(
      pendingCompletion,
    );
  });

  it('rejects an active session and history entry with the same ID but incompatible context', async () => {
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', [
      {
        id: runningSession.id,
        task: { ...runningSession.task, title: 'Outro contexto' },
        taskList: runningSession.taskList,
        startedAtMs: runningSession.startedAtMs,
        endedAtMs: 2_000,
        periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
        durationMs: 1_000,
      },
    ]);

    await expect(readStoredTimerState()).resolves.toEqual({ status: 'invalid' });
  });

  it('discards unrecognized fields while reconstructing stored data', async () => {
    await storage.setItem('local:active-session', {
      ...pausedSession,
      token: 'must-not-circulate',
      task: { ...pausedSession.task, notes: 'not part of the snapshot' },
      taskList: { ...pausedSession.taskList, position: 'ignored' },
      periods: pausedSession.periods.map((period) => ({ ...period, extra: true })),
    });
    await storage.setItem('local:session-history', [
      {
        ...completedSession,
        remoteResponse: { status: 'completed' },
        task: { ...completedSession.task, notes: 'not part of the snapshot' },
      },
    ]);

    await expect(readActiveSession()).resolves.toEqual({
      status: 'ready',
      value: pausedSession,
    });
    await expect(readSessionHistory()).resolves.toEqual({
      status: 'ready',
      value: [completedSession],
    });
  });

  it.each([
    ['a primitive', 'invalid'],
    ['an unknown state', { ...runningSession, state: 'stopped' }],
    ['a missing snapshot', { ...runningSession, task: undefined }],
    ['an empty identifier', { ...runningSession, id: '' }],
    ['an invalid timestamp', { ...runningSession, runningSinceMs: -1 }],
    ['a mismatched initial boundary', { ...runningSession, runningSinceMs: 1_001 }],
    [
      'an inverted period',
      {
        ...pausedSession,
        periods: [{ startedAtMs: 1_000, endedAtMs: 999 }],
      },
    ],
    [
      'overlapping periods',
      {
        ...pausedSession,
        periods: [
          { startedAtMs: 1_000, endedAtMs: 3_000 },
          { startedAtMs: 2_000, endedAtMs: 4_000 },
        ],
      },
    ],
    ['a paused session without periods', { ...pausedSession, periods: [] }],
  ])('reports %s as an invalid active session', async (_description, value) => {
    await storage.setItem('local:active-session', value);

    await expect(readActiveSession()).resolves.toEqual({ status: 'invalid' });
    await expect(storage.snapshot('local')).resolves.toEqual({ 'active-session': value });
  });

  it.each([
    ['a non-array value', completedSession],
    ['an invalid entry', [{ ...completedSession, taskList: null }]],
    ['an inconsistent duration', [{ ...completedSession, durationMs: 1_999 }]],
    ['an end before the final period', [{ ...completedSession, endedAtMs: 3_500 }]],
    [
      'overlapping periods',
      [
        {
          ...completedSession,
          periods: [
            { startedAtMs: 1_000, endedAtMs: 3_000 },
            { startedAtMs: 2_000, endedAtMs: 4_000 },
          ],
          durationMs: 4_000,
        },
      ],
    ],
    ['duplicate session IDs', [completedSession, completedSession]],
  ])('reports history containing %s as invalid', async (_description, value) => {
    await storage.setItem('local:session-history', value);

    await expect(readSessionHistory()).resolves.toEqual({ status: 'invalid' });
    await expect(storage.snapshot('local')).resolves.toEqual({ 'session-history': value });
  });

  it('uses only the local storage area', async () => {
    await storage.setItem('local:active-session', runningSession);
    await storage.setItem('local:session-history', [completedSession]);

    await readActiveSession();
    await readSessionHistory();

    await expect(storage.snapshot('local')).resolves.toEqual({
      'active-session': runningSession,
      'session-history': [completedSession],
    });
    await expect(storage.snapshot('session')).resolves.toEqual({});
    await expect(storage.snapshot('sync')).resolves.toEqual({});
  });

  it('propagates storage API failures instead of reporting invalid data', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('controlled storage failure'),
    );

    await expect(readActiveSession()).rejects.toThrow('controlled storage failure');
  });
});
