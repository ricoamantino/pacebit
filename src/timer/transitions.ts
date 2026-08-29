import type {
  ActiveSession,
  CompletedSession,
  ExecutionPeriod,
  NonEmptyExecutionPeriods,
  PausedSession,
  RunningSession,
  TaskListSnapshot,
  TaskSnapshot,
  TimestampMs,
} from './session';

export interface StartSessionInput {
  readonly id: string;
  readonly task: TaskSnapshot;
  readonly taskList: TaskListSnapshot;
  readonly startedAtMs: TimestampMs;
}

export type TransitionRejection =
  | 'active-session-exists'
  | 'no-active-session'
  | 'invalid-timestamp'
  | 'timestamp-out-of-order';

export type TransitionResult<T> =
  | { readonly status: 'applied'; readonly value: T }
  | { readonly status: 'unchanged'; readonly value: T }
  | { readonly status: 'rejected'; readonly reason: TransitionRejection };

export function startSession(
  current: ActiveSession | null,
  input: StartSessionInput,
): TransitionResult<ActiveSession> {
  if (!isValidTimestamp(input.startedAtMs)) {
    return rejected('invalid-timestamp');
  }

  if (current) {
    return current.id === input.id ? unchanged(current) : rejected('active-session-exists');
  }

  return applied({
    id: input.id,
    task: input.task,
    taskList: input.taskList,
    startedAtMs: input.startedAtMs,
    state: 'running',
    periods: [],
    runningSinceMs: input.startedAtMs,
  });
}

export function pauseSession(
  current: ActiveSession | null,
  atMs: TimestampMs,
): TransitionResult<PausedSession> {
  if (!isValidTimestamp(atMs)) {
    return rejected('invalid-timestamp');
  }

  if (!current) {
    return rejected('no-active-session');
  }

  if (current.state === 'paused') {
    return unchanged(current);
  }

  if (atMs < current.runningSinceMs) {
    return rejected('timestamp-out-of-order');
  }

  const period: ExecutionPeriod = {
    startedAtMs: current.runningSinceMs,
    endedAtMs: atMs,
  };
  const periods = appendExecutionPeriod(current.periods, period);

  return applied({
    id: current.id,
    task: current.task,
    taskList: current.taskList,
    startedAtMs: current.startedAtMs,
    state: 'paused',
    periods,
  });
}

export function resumeSession(
  current: ActiveSession | null,
  atMs: TimestampMs,
): TransitionResult<RunningSession> {
  if (!isValidTimestamp(atMs)) {
    return rejected('invalid-timestamp');
  }

  if (!current) {
    return rejected('no-active-session');
  }

  if (current.state === 'running') {
    return unchanged(current);
  }

  if (atMs < getLastPeriod(current.periods).endedAtMs) {
    return rejected('timestamp-out-of-order');
  }

  return applied({
    ...current,
    state: 'running',
    runningSinceMs: atMs,
  });
}

export function finishSession(
  current: ActiveSession | null,
  atMs: TimestampMs,
): TransitionResult<CompletedSession> {
  if (!isValidTimestamp(atMs)) {
    return rejected('invalid-timestamp');
  }

  if (!current) {
    return rejected('no-active-session');
  }

  const periods = closeSessionPeriods(current, atMs);

  if (!periods) {
    return rejected('timestamp-out-of-order');
  }

  return applied({
    id: current.id,
    task: current.task,
    taskList: current.taskList,
    startedAtMs: current.startedAtMs,
    endedAtMs: atMs,
    periods,
    durationMs: periods.reduce(
      (durationMs, period) => durationMs + period.endedAtMs - period.startedAtMs,
      0,
    ),
  });
}

export function cancelSession(current: ActiveSession | null): TransitionResult<null> {
  return current ? applied(null) : unchanged(null);
}

function closeSessionPeriods(
  session: ActiveSession,
  atMs: TimestampMs,
): NonEmptyExecutionPeriods | null {
  if (session.state === 'paused') {
    return atMs < getLastPeriod(session.periods).endedAtMs ? null : session.periods;
  }

  if (atMs < session.runningSinceMs) {
    return null;
  }

  return appendExecutionPeriod(session.periods, {
    startedAtMs: session.runningSinceMs,
    endedAtMs: atMs,
  });
}

function getLastPeriod(periods: NonEmptyExecutionPeriods): ExecutionPeriod {
  return periods[periods.length - 1] ?? periods[0];
}

function appendExecutionPeriod(
  periods: readonly ExecutionPeriod[],
  period: ExecutionPeriod,
): NonEmptyExecutionPeriods {
  const firstPeriod = periods[0];

  return firstPeriod ? [firstPeriod, ...periods.slice(1), period] : [period];
}

function isValidTimestamp(timestampMs: TimestampMs): boolean {
  return Number.isSafeInteger(timestampMs) && timestampMs >= 0;
}

function applied<T>(value: T): TransitionResult<T> {
  return { status: 'applied', value };
}

function unchanged<T>(value: T): TransitionResult<T> {
  return { status: 'unchanged', value };
}

function rejected<T>(reason: TransitionRejection): TransitionResult<T> {
  return { status: 'rejected', reason };
}
