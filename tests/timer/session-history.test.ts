import { describe, expect, it } from 'vitest';
import type { CompletedSession } from '../../src/timer/session';
import { orderCompletedSessionsByMostRecent } from '../../src/timer/session-history';

describe('orderCompletedSessionsByMostRecent', () => {
  it('ordena por fim, início e ID sem alterar a coleção recebida', () => {
    const latestById = completedSession('a', 2_000, 5_000);
    const laterId = completedSession('b', 2_000, 5_000);
    const earlierStart = completedSession('z', 1_000, 5_000);
    const oldest = completedSession('oldest', 3_000, 4_000);
    const history = [oldest, laterId, earlierStart, latestById] as const;

    const ordered = orderCompletedSessionsByMostRecent(history);

    expect(ordered.map((session) => session.id)).toEqual(['a', 'b', 'z', 'oldest']);
    expect(ordered).not.toBe(history);
    expect(history).toEqual([oldest, laterId, earlierStart, latestById]);
  });

  it('aceita histórico vazio e com uma única sessão', () => {
    const session = completedSession('only', 1_000, 1_000);

    expect(orderCompletedSessionsByMostRecent([])).toEqual([]);
    expect(orderCompletedSessionsByMostRecent([session])).toEqual([session]);
  });
});

function completedSession(id: string, startedAtMs: number, endedAtMs: number): CompletedSession {
  return {
    id,
    task: { id: `task-${id}`, title: `Tarefa ${id}` },
    taskList: { id: 'list', title: 'Lista' },
    startedAtMs,
    endedAtMs,
    periods: [{ startedAtMs, endedAtMs }],
    durationMs: endedAtMs - startedAtMs,
  };
}
