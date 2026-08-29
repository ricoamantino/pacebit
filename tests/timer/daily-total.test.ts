import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  calculateDailyTotal,
  calculatePeriodDurationInLocalDay,
  getLocalDayInterval,
} from '../../src/timer/daily-total';
import { calculateExecutionDuration } from '../../src/timer/duration';
import type {
  CompletedSession,
  ExecutionPeriod,
  PausedSession,
  RunningSession,
} from '../../src/timer/session';

const hourMs = 60 * 60 * 1_000;
const originalTimeZone = process.env.TZ;
const sessionContext = {
  id: 'session-1',
  task: { id: 'task-1', title: 'Preparar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
} as const;

function timestamp(value: string): number {
  return Date.parse(value);
}

function completedSession(
  periods: readonly [ExecutionPeriod, ...ExecutionPeriod[]],
): CompletedSession {
  return {
    ...sessionContext,
    startedAtMs: periods[0].startedAtMs,
    endedAtMs: periods[periods.length - 1]?.endedAtMs ?? periods[0].endedAtMs,
    periods,
    durationMs: calculateExecutionDuration(periods),
  };
}

describe.sequential('total do dia local', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  });

  it('calcula limites semiabertos do dia local', () => {
    expect(getLocalDayInterval(timestamp('2026-08-29T12:00:00Z'))).toEqual({
      startedAtMs: timestamp('2026-08-29T00:00:00Z'),
      endedAtMs: timestamp('2026-08-30T00:00:00Z'),
    });
  });

  it('calcula períodos dentro, fora e parcialmente dentro do dia', () => {
    const day = timestamp('2026-08-29T12:00:00Z');

    expect(
      calculatePeriodDurationInLocalDay(
        {
          startedAtMs: timestamp('2026-08-29T01:00:00Z'),
          endedAtMs: timestamp('2026-08-29T03:00:00Z'),
        },
        day,
      ),
    ).toBe(2 * hourMs);
    expect(
      calculatePeriodDurationInLocalDay(
        {
          startedAtMs: timestamp('2026-08-28T23:00:00Z'),
          endedAtMs: timestamp('2026-08-29T01:00:00Z'),
        },
        day,
      ),
    ).toBe(hourMs);
    expect(
      calculatePeriodDurationInLocalDay(
        {
          startedAtMs: timestamp('2026-08-28T20:00:00Z'),
          endedAtMs: timestamp('2026-08-28T21:00:00Z'),
        },
        day,
      ),
    ).toBe(0);
  });

  it('não conta duas vezes períodos que terminam ou começam à meia-noite', () => {
    const day = timestamp('2026-08-29T12:00:00Z');

    expect(
      calculatePeriodDurationInLocalDay(
        {
          startedAtMs: timestamp('2026-08-28T23:00:00Z'),
          endedAtMs: timestamp('2026-08-29T00:00:00Z'),
        },
        day,
      ),
    ).toBe(0);
    expect(
      calculatePeriodDurationInLocalDay(
        {
          startedAtMs: timestamp('2026-08-29T00:00:00Z'),
          endedAtMs: timestamp('2026-08-29T01:00:00Z'),
        },
        day,
      ),
    ).toBe(hourMs);
  });

  it('atribui ao dia somente a parcela de uma sessão concluída que cruza a meia-noite', () => {
    const completed = completedSession([
      {
        startedAtMs: timestamp('2026-08-28T23:30:00Z'),
        endedAtMs: timestamp('2026-08-29T00:30:00Z'),
      },
    ]);

    expect(
      calculateDailyTotal({
        completedSessions: [completed],
        activeSession: null,
        nowMs: timestamp('2026-08-29T12:00:00Z'),
      }),
    ).toBe(30 * 60 * 1_000);
  });

  it('soma histórico e a parcela corrente de uma sessão em execução', () => {
    const completed = completedSession([
      {
        startedAtMs: timestamp('2026-08-29T00:30:00Z'),
        endedAtMs: timestamp('2026-08-29T01:30:00Z'),
      },
    ]);
    const running: RunningSession = {
      ...sessionContext,
      startedAtMs: timestamp('2026-08-29T02:00:00Z'),
      state: 'running',
      periods: [
        {
          startedAtMs: timestamp('2026-08-29T02:00:00Z'),
          endedAtMs: timestamp('2026-08-29T02:30:00Z'),
        },
      ],
      runningSinceMs: timestamp('2026-08-29T03:00:00Z'),
    };

    expect(
      calculateDailyTotal({
        completedSessions: [completed],
        activeSession: running,
        nowMs: timestamp('2026-08-29T04:00:00Z'),
      }),
    ).toBe(2.5 * hourMs);
  });

  it('exclui o intervalo corrente quando a sessão está pausada', () => {
    const paused: PausedSession = {
      ...sessionContext,
      startedAtMs: timestamp('2026-08-29T02:00:00Z'),
      state: 'paused',
      periods: [
        {
          startedAtMs: timestamp('2026-08-29T02:00:00Z'),
          endedAtMs: timestamp('2026-08-29T02:30:00Z'),
        },
      ],
    };

    expect(
      calculateDailyTotal({
        completedSessions: [],
        activeSession: paused,
        nowMs: timestamp('2026-08-29T04:00:00Z'),
      }),
    ).toBe(0.5 * hourMs);
  });

  it('recalcula a parcela corrente ao atravessar a meia-noite', () => {
    const running: RunningSession = {
      ...sessionContext,
      startedAtMs: timestamp('2026-08-29T23:30:00Z'),
      state: 'running',
      periods: [],
      runningSinceMs: timestamp('2026-08-29T23:30:00Z'),
    };

    expect(
      calculateDailyTotal({
        completedSessions: [],
        activeSession: running,
        nowMs: timestamp('2026-08-29T23:45:00Z'),
      }),
    ).toBe(15 * 60 * 1_000);
    expect(
      calculateDailyTotal({
        completedSessions: [],
        activeSession: running,
        nowMs: timestamp('2026-08-30T00:15:00Z'),
      }),
    ).toBe(15 * 60 * 1_000);
  });

  it('respeita dias locais de 23 e 25 horas', () => {
    process.env.TZ = 'America/New_York';

    const springDay = getLocalDayInterval(timestamp('2026-03-08T12:00:00Z'));
    const autumnDay = getLocalDayInterval(timestamp('2026-11-01T12:00:00Z'));

    expect(springDay.endedAtMs - springDay.startedAtMs).toBe(23 * hourMs);
    expect(autumnDay.endedAtMs - autumnDay.startedAtMs).toBe(25 * hourMs);
  });

  it('mantém duração absoluta e recalcula pertencimento após mudança de fuso', () => {
    const period: ExecutionPeriod = {
      startedAtMs: timestamp('2026-08-29T00:30:00Z'),
      endedAtMs: timestamp('2026-08-29T02:30:00Z'),
    };
    const completed = completedSession([period]);
    const snapshot = structuredClone(completed);
    const nowMs = timestamp('2026-08-29T03:00:00Z');

    const utcTotal = calculateDailyTotal({
      completedSessions: [completed],
      activeSession: null,
      nowMs,
    });
    process.env.TZ = 'America/Sao_Paulo';
    const saoPauloTotal = calculateDailyTotal({
      completedSessions: [completed],
      activeSession: null,
      nowMs,
    });

    expect(calculateExecutionDuration(completed.periods)).toBe(2 * hourMs);
    expect(utcTotal).toBe(2 * hourMs);
    expect(saoPauloTotal).toBe(0);
    expect(completed).toEqual(snapshot);
  });
});
