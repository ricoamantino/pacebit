import { storage } from 'wxt/utils/storage';
import type {
  ActiveSession,
  CompletedSession,
  ExecutionPeriod,
  PausedSession,
  RunningSession,
  TimestampMs,
} from '../timer/session';
import {
  cancelSession,
  finishSession,
  pauseSession,
  resumeSession,
  type StartSessionInput,
  startSession,
  type TransitionResult,
} from '../timer/transitions';
import { decodeActiveSession, decodeSessionHistory, type SessionStorageRead } from './session-data';

export type { SessionStorageRead } from './session-data';

const activeSessionItem = storage.defineItem<unknown>('local:active-session');
const sessionHistoryItem = storage.defineItem<unknown>('local:session-history', {
  fallback: [],
});

export type SessionPersistenceFailure =
  | 'invalid-stored-data'
  | 'quota-exceeded'
  | 'storage-unavailable';

export type StoredTransitionResult<T> =
  | TransitionResult<T>
  | { readonly status: 'failed'; readonly reason: SessionPersistenceFailure };

export async function readActiveSession(): Promise<SessionStorageRead<ActiveSession | null>> {
  return decodeActiveSession(await activeSessionItem.getValue());
}

export async function readSessionHistory(): Promise<
  SessionStorageRead<readonly CompletedSession[]>
> {
  return decodeSessionHistory(await sessionHistoryItem.getValue());
}

export async function startStoredSession(
  input: StartSessionInput,
): Promise<StoredTransitionResult<ActiveSession>> {
  return persistActiveTransition((current) => startSession(current, input));
}

export async function pauseStoredSession(
  atMs: TimestampMs,
): Promise<StoredTransitionResult<PausedSession>> {
  return persistActiveTransition((current) => pauseSession(current, atMs));
}

export async function resumeStoredSession(
  atMs: TimestampMs,
): Promise<StoredTransitionResult<RunningSession>> {
  return persistActiveTransition((current) => resumeSession(current, atMs));
}

export async function cancelStoredSession(): Promise<StoredTransitionResult<null>> {
  try {
    const current = await readActiveSession();

    if (current.status === 'invalid') {
      return failed('invalid-stored-data');
    }

    const result = cancelSession(current.value);

    if (result.status === 'applied') {
      await activeSessionItem.removeValue();
    }

    return result;
  } catch (error) {
    return failed(classifyStorageFailure(error));
  }
}

export async function finishStoredSession(
  atMs: TimestampMs,
): Promise<StoredTransitionResult<CompletedSession>> {
  try {
    const [current, history] = await Promise.all([readActiveSession(), readSessionHistory()]);

    if (current.status === 'invalid' || history.status === 'invalid') {
      return failed('invalid-stored-data');
    }

    const result = finishSession(current.value, atMs);

    if (result.status !== 'applied') {
      return result;
    }

    const existingSession = history.value.find((session) => session.id === result.value.id);

    if (
      existingSession &&
      (!current.value || !isCompletionOfActiveSession(existingSession, current.value))
    ) {
      return failed('invalid-stored-data');
    }

    const completedSession = existingSession ?? result.value;

    if (!existingSession) {
      await sessionHistoryItem.setValue([...history.value, completedSession]);
    }

    await activeSessionItem.removeValue();

    return { status: 'applied', value: completedSession };
  } catch (error) {
    return failed(classifyStorageFailure(error));
  }
}

async function persistActiveTransition<T extends ActiveSession>(
  transition: (current: ActiveSession | null) => TransitionResult<T>,
): Promise<StoredTransitionResult<T>> {
  try {
    const current = await readActiveSession();

    if (current.status === 'invalid') {
      return failed('invalid-stored-data');
    }

    const result = transition(current.value);

    if (result.status === 'applied') {
      await activeSessionItem.setValue(result.value);
    }

    return result;
  } catch (error) {
    return failed(classifyStorageFailure(error));
  }
}

function isCompletionOfActiveSession(completed: CompletedSession, active: ActiveSession): boolean {
  if (!hasSameSessionContext(completed, active)) {
    return false;
  }

  if (active.state === 'paused') {
    return haveSamePeriods(completed.periods, active.periods);
  }

  const finalPeriod = completed.periods.at(-1);
  const closedPeriods = completed.periods.slice(0, -1);

  return (
    completed.periods.length === active.periods.length + 1 &&
    haveSamePeriods(closedPeriods, active.periods) &&
    finalPeriod?.startedAtMs === active.runningSinceMs &&
    finalPeriod?.endedAtMs === completed.endedAtMs
  );
}

function hasSameSessionContext(completed: CompletedSession, active: ActiveSession): boolean {
  return (
    completed.id === active.id &&
    completed.startedAtMs === active.startedAtMs &&
    completed.task.id === active.task.id &&
    completed.task.title === active.task.title &&
    completed.taskList.id === active.taskList.id &&
    completed.taskList.title === active.taskList.title
  );
}

function haveSamePeriods(
  left: readonly ExecutionPeriod[],
  right: readonly ExecutionPeriod[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (period, index) =>
        period.startedAtMs === right[index]?.startedAtMs &&
        period.endedAtMs === right[index]?.endedAtMs,
    )
  );
}

function classifyStorageFailure(error: unknown): SessionPersistenceFailure {
  if (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' || /quota/i.test(error.message))
  ) {
    return 'quota-exceeded';
  }

  return 'storage-unavailable';
}

function failed<T>(reason: SessionPersistenceFailure): StoredTransitionResult<T> {
  return { status: 'failed', reason };
}
