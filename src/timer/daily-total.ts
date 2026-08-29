import type {
  ActiveSession,
  CompletedSession,
  DurationMs,
  ExecutionPeriod,
  TimestampMs,
} from './session';

export interface LocalDayInterval {
  readonly startedAtMs: TimestampMs;
  readonly endedAtMs: TimestampMs;
}

export interface DailyTotalInput {
  readonly completedSessions: readonly CompletedSession[];
  readonly activeSession: ActiveSession | null;
  readonly nowMs: TimestampMs;
}

export function getLocalDayInterval(referenceMs: TimestampMs): LocalDayInterval {
  const reference = new Date(referenceMs);
  const startedAtMs = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  ).getTime();
  const endedAtMs = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + 1,
  ).getTime();

  return { startedAtMs, endedAtMs };
}

export function calculatePeriodDurationInLocalDay(
  period: ExecutionPeriod,
  dayReferenceMs: TimestampMs,
): DurationMs {
  return calculateIntersectionDuration(period, getLocalDayInterval(dayReferenceMs));
}

export function calculateDailyTotal({
  completedSessions,
  activeSession,
  nowMs,
}: DailyTotalInput): DurationMs {
  const day = getLocalDayInterval(nowMs);
  let totalMs = 0;

  for (const session of completedSessions) {
    totalMs += calculatePeriodsWithinInterval(session.periods, day);
  }

  if (!activeSession) {
    return totalMs;
  }

  totalMs += calculatePeriodsWithinInterval(activeSession.periods, day);

  if (activeSession.state === 'running') {
    totalMs += calculateIntersectionDuration(
      { startedAtMs: activeSession.runningSinceMs, endedAtMs: nowMs },
      day,
    );
  }

  return totalMs;
}

function calculatePeriodsWithinInterval(
  periods: readonly ExecutionPeriod[],
  interval: LocalDayInterval,
): DurationMs {
  return periods.reduce(
    (durationMs, period) => durationMs + calculateIntersectionDuration(period, interval),
    0,
  );
}

function calculateIntersectionDuration(
  period: ExecutionPeriod,
  interval: LocalDayInterval,
): DurationMs {
  const startedAtMs = Math.max(period.startedAtMs, interval.startedAtMs);
  const endedAtMs = Math.min(period.endedAtMs, interval.endedAtMs);

  return Math.max(0, endedAtMs - startedAtMs);
}
