import { describe, expect, it } from 'vitest';
import {
  calculateActiveSessionDuration,
  calculateExecutionDuration,
} from '../../src/timer/duration';
import type { PausedSession, RunningSession } from '../../src/timer/session';
import { finishSession } from '../../src/timer/transitions';

const sessionContext = {
  id: 'session-1',
  task: { id: 'task-1', title: 'Preparar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
} as const;

describe('duração de execução', () => {
  it('soma nenhum, um e vários períodos sem incluir as lacunas', () => {
    expect(calculateExecutionDuration([])).toBe(0);
    expect(calculateExecutionDuration([{ startedAtMs: 1_000, endedAtMs: 2_000 }])).toBe(1_000);
    expect(
      calculateExecutionDuration([
        { startedAtMs: 1_000, endedAtMs: 2_000 },
        { startedAtMs: 5_000, endedAtMs: 8_000 },
      ]),
    ).toBe(4_000);
  });

  it('preserva períodos de duração zero', () => {
    expect(calculateExecutionDuration([{ startedAtMs: 1_000, endedAtMs: 1_000 }])).toBe(0);
  });

  it('inclui o período corrente somente quando a sessão está em execução', () => {
    const running: RunningSession = {
      ...sessionContext,
      state: 'running',
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      runningSinceMs: 5_000,
    };
    const paused: PausedSession = {
      ...sessionContext,
      state: 'paused',
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
    };

    expect(calculateActiveSessionDuration(running, 8_000)).toBe(4_000);
    expect(calculateActiveSessionDuration(paused, 8_000)).toBe(1_000);
  });

  it('usa o mesmo cálculo ao finalizar uma sessão', () => {
    const running: RunningSession = {
      ...sessionContext,
      state: 'running',
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      runningSinceMs: 5_000,
    };

    expect(finishSession(running, 8_000)).toMatchObject({
      status: 'applied',
      value: { durationMs: 4_000 },
    });
  });
});
