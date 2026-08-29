import type { ActiveSession, DurationMs, ExecutionPeriod, TimestampMs } from './session';

export function calculateExecutionDuration(periods: readonly ExecutionPeriod[]): DurationMs {
  return periods.reduce(
    (durationMs, period) => durationMs + period.endedAtMs - period.startedAtMs,
    0,
  );
}

export function calculateActiveSessionDuration(
  session: ActiveSession,
  nowMs: TimestampMs,
): DurationMs {
  const closedDurationMs = calculateExecutionDuration(session.periods);

  return session.state === 'running'
    ? closedDurationMs + nowMs - session.runningSinceMs
    : closedDurationMs;
}
