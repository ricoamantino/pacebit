import type { CompletedSession } from './session';

export function orderCompletedSessionsByMostRecent(
  history: readonly CompletedSession[],
): readonly CompletedSession[] {
  return [...history].sort((left, right) => {
    if (left.endedAtMs !== right.endedAtMs) {
      return left.endedAtMs < right.endedAtMs ? 1 : -1;
    }

    if (left.startedAtMs !== right.startedAtMs) {
      return left.startedAtMs < right.startedAtMs ? 1 : -1;
    }

    return compareIds(left.id, right.id);
  });
}

function compareIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
