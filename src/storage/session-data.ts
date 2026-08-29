import { calculateExecutionDuration } from '../timer/duration';
import type {
  ActiveSession,
  CompletedSession,
  ExecutionPeriod,
  NonEmptyExecutionPeriods,
  TaskListSnapshot,
  TaskSnapshot,
} from '../timer/session';

export type SessionStorageRead<T> =
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'invalid' };

export function decodeActiveSession(value: unknown): SessionStorageRead<ActiveSession | null> {
  if (value === null) {
    return ready(null);
  }

  const record = asRecord(value);

  if (!record) {
    return invalid();
  }

  const context = decodeSessionContext(record);
  const periods = decodeExecutionPeriods(record.periods);

  if (!context || !periods || !hasValidPeriodSequence(periods, context.startedAtMs)) {
    return invalid();
  }

  if (record.state === 'running') {
    const runningSinceMs = decodeTimestamp(record.runningSinceMs);

    if (
      runningSinceMs === null ||
      !hasValidRunningBoundary(periods, context.startedAtMs, runningSinceMs)
    ) {
      return invalid();
    }

    return ready({
      ...context,
      state: 'running',
      periods,
      runningSinceMs,
    });
  }

  if (record.state === 'paused') {
    const nonEmptyPeriods = toNonEmptyPeriods(periods);

    return nonEmptyPeriods
      ? ready({
          ...context,
          state: 'paused',
          periods: nonEmptyPeriods,
        })
      : invalid();
  }

  return invalid();
}

export function decodeSessionHistory(
  value: unknown,
): SessionStorageRead<readonly CompletedSession[]> {
  if (!Array.isArray(value)) {
    return invalid();
  }

  const sessions: CompletedSession[] = [];
  const sessionIds = new Set<string>();

  for (const entry of value) {
    const session = decodeCompletedSession(entry);

    if (!session || sessionIds.has(session.id)) {
      return invalid();
    }

    sessionIds.add(session.id);
    sessions.push(session);
  }

  return ready(sessions);
}

interface DecodedSessionContext {
  readonly id: string;
  readonly task: TaskSnapshot;
  readonly taskList: TaskListSnapshot;
  readonly startedAtMs: number;
}

function decodeCompletedSession(value: unknown): CompletedSession | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const context = decodeSessionContext(record);
  const endedAtMs = decodeTimestamp(record.endedAtMs);
  const durationMs = decodeTimestamp(record.durationMs);
  const periods = decodeExecutionPeriods(record.periods);
  const nonEmptyPeriods = periods ? toNonEmptyPeriods(periods) : null;

  if (
    !context ||
    endedAtMs === null ||
    durationMs === null ||
    !nonEmptyPeriods ||
    !hasValidPeriodSequence(nonEmptyPeriods, context.startedAtMs) ||
    endedAtMs < getLastPeriod(nonEmptyPeriods).endedAtMs
  ) {
    return null;
  }

  const calculatedDurationMs = calculateExecutionDuration(nonEmptyPeriods);

  if (!Number.isSafeInteger(calculatedDurationMs) || durationMs !== calculatedDurationMs) {
    return null;
  }

  return {
    ...context,
    endedAtMs,
    periods: nonEmptyPeriods,
    durationMs,
  };
}

function decodeSessionContext(record: Record<string, unknown>): DecodedSessionContext | null {
  const id = decodeIdentifier(record.id);
  const task = decodeSnapshot(record.task);
  const taskList = decodeSnapshot(record.taskList);
  const startedAtMs = decodeTimestamp(record.startedAtMs);

  return id && task && taskList && startedAtMs !== null
    ? { id, task, taskList, startedAtMs }
    : null;
}

function decodeSnapshot(value: unknown): TaskSnapshot | TaskListSnapshot | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const id = decodeIdentifier(record.id);

  return id && typeof record.title === 'string' ? { id, title: record.title } : null;
}

function decodeExecutionPeriods(value: unknown): readonly ExecutionPeriod[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const periods: ExecutionPeriod[] = [];

  for (const entry of value) {
    const record = asRecord(entry);
    const startedAtMs = record ? decodeTimestamp(record.startedAtMs) : null;
    const endedAtMs = record ? decodeTimestamp(record.endedAtMs) : null;

    if (startedAtMs === null || endedAtMs === null || endedAtMs < startedAtMs) {
      return null;
    }

    periods.push({ startedAtMs, endedAtMs });
  }

  return periods;
}

function hasValidPeriodSequence(
  periods: readonly ExecutionPeriod[],
  sessionStartedAtMs: number,
): boolean {
  const firstPeriod = periods[0];

  if (firstPeriod && firstPeriod.startedAtMs !== sessionStartedAtMs) {
    return false;
  }

  return periods.every((period, index) => {
    const previousPeriod = periods[index - 1];
    return !previousPeriod || period.startedAtMs >= previousPeriod.endedAtMs;
  });
}

function hasValidRunningBoundary(
  periods: readonly ExecutionPeriod[],
  sessionStartedAtMs: number,
  runningSinceMs: number,
): boolean {
  const lastPeriod = periods.at(-1);

  return lastPeriod
    ? runningSinceMs >= lastPeriod.endedAtMs
    : runningSinceMs === sessionStartedAtMs;
}

function toNonEmptyPeriods(periods: readonly ExecutionPeriod[]): NonEmptyExecutionPeriods | null {
  const firstPeriod = periods[0];
  return firstPeriod ? [firstPeriod, ...periods.slice(1)] : null;
}

function getLastPeriod(periods: NonEmptyExecutionPeriods): ExecutionPeriod {
  return periods[periods.length - 1] ?? periods[0];
}

function decodeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function decodeTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ready<T>(value: T): SessionStorageRead<T> {
  return { status: 'ready', value };
}

function invalid<T>(): SessionStorageRead<T> {
  return { status: 'invalid' };
}
