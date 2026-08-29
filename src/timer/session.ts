/** An instant represented as Unix time in milliseconds. */
export type TimestampMs = number;

/** An elapsed duration represented in milliseconds. */
export type DurationMs = number;

export interface TaskSnapshot {
  readonly id: string;
  readonly title: string;
}

export interface TaskListSnapshot {
  readonly id: string;
  readonly title: string;
}

export interface ExecutionPeriod {
  readonly startedAtMs: TimestampMs;
  readonly endedAtMs: TimestampMs;
}

export type NonEmptyExecutionPeriods = readonly [ExecutionPeriod, ...ExecutionPeriod[]];

interface SessionContext {
  readonly id: string;
  readonly task: TaskSnapshot;
  readonly taskList: TaskListSnapshot;
  readonly startedAtMs: TimestampMs;
}

export interface RunningSession extends SessionContext {
  readonly state: 'running';
  readonly periods: readonly ExecutionPeriod[];
  readonly runningSinceMs: TimestampMs;
}

export interface PausedSession extends SessionContext {
  readonly state: 'paused';
  readonly periods: NonEmptyExecutionPeriods;
}

export type ActiveSession = RunningSession | PausedSession;

export interface CompletedSession extends SessionContext {
  readonly endedAtMs: TimestampMs;
  readonly periods: NonEmptyExecutionPeriods;
  readonly durationMs: DurationMs;
}
