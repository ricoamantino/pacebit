import { describe, expect, it } from 'vitest';
import { formatDuration, formatSessionInterval } from '../../entrypoints/popup/time-format';
import type { CompletedSession } from '../../src/timer/session';

describe('popup time formatting', () => {
  it('formata intervalo no mesmo dia civil local', () => {
    const session = completedSession(
      new Date(2026, 7, 29, 14, 30).getTime(),
      new Date(2026, 7, 29, 15, 15).getTime(),
    );

    expect(formatSessionInterval(session)).toBe('29/08/2026 · 14:30–15:15');
  });

  it('formata intervalo que atravessa a meia-noite local', () => {
    const session = completedSession(
      new Date(2026, 7, 29, 23, 50).getTime(),
      new Date(2026, 7, 30, 0, 20).getTime(),
    );

    expect(formatSessionInterval(session)).toBe('29/08/2026 23:50 → 30/08/2026 00:20');
  });

  it('mantém duração executada independente do intervalo de parede', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });
});

function completedSession(startedAtMs: number, endedAtMs: number): CompletedSession {
  return {
    id: 'session',
    task: { id: 'task', title: 'Tarefa' },
    taskList: { id: 'list', title: 'Lista' },
    startedAtMs,
    endedAtMs,
    periods: [{ startedAtMs, endedAtMs }],
    durationMs: 1_000,
  };
}
