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
import { withSessionStorageLock } from './session-coordination';
import { decodeActiveSession, decodeSessionHistory, type SessionStorageRead } from './session-data';

export type { SessionStorageRead } from './session-data';

const activeSessionItem = storage.defineItem<unknown>('local:active-session');
const sessionHistoryItem = storage.defineItem<unknown>('local:session-history', {
  fallback: [],
});

export interface StoredTimerState {
  readonly activeSession: ActiveSession | null;
  readonly history: readonly CompletedSession[];
}

export type SessionPersistenceFailure =
  | 'invalid-stored-data'
  | 'quota-exceeded'
  | 'storage-unavailable';

export interface StoredTransitionConflict {
  readonly status: 'conflict';
  readonly reason: 'stale-state' | 'finalization-pending';
  readonly state: StoredTimerState;
}

export type StoredTransitionResult<T> =
  | TransitionResult<T>
  | StoredTransitionConflict
  | { readonly status: 'failed'; readonly reason: SessionPersistenceFailure };

export type StoredTimerStateObservation =
  | SessionStorageRead<StoredTimerState>
  | { readonly status: 'failed'; readonly reason: SessionPersistenceFailure };

export async function readActiveSession(): Promise<SessionStorageRead<ActiveSession | null>> {
  return withSessionStorageLock(readActiveSessionUnlocked);
}

export async function readSessionHistory(): Promise<
  SessionStorageRead<readonly CompletedSession[]>
> {
  return withSessionStorageLock(readSessionHistoryUnlocked);
}

export async function readStoredTimerState(): Promise<SessionStorageRead<StoredTimerState>> {
  return withSessionStorageLock(readStoredTimerStateUnlocked);
}

export function observeStoredTimerState(
  listener: (observation: StoredTimerStateObservation) => void,
): () => void {
  let active = true;
  let refreshRequested = false;
  let refreshing = false;

  const refresh = async () => {
    if (refreshing) {
      return;
    }

    refreshing = true;

    while (active && refreshRequested) {
      refreshRequested = false;

      let observation: StoredTimerStateObservation;

      try {
        observation = await readStoredTimerState();
      } catch (error) {
        observation = failed(classifyStorageFailure(error));
      }

      if (active && !refreshRequested) {
        listener(observation);
      }
    }

    refreshing = false;
  };

  const requestRefresh = () => {
    refreshRequested = true;
    void refresh();
  };

  const unwatchActiveSession = activeSessionItem.watch(requestRefresh);
  const unwatchSessionHistory = sessionHistoryItem.watch(requestRefresh);

  requestRefresh();

  return () => {
    active = false;
    unwatchActiveSession();
    unwatchSessionHistory();
  };
}

export async function startStoredSession(
  expected: null,
  input: StartSessionInput,
): Promise<StoredTransitionResult<ActiveSession>> {
  return executeStoredCommand(async (state) => {
    const completion = findCompletionForActiveSession(state);

    if (completion.status === 'incompatible') {
      return failed('invalid-stored-data');
    }

    if (!haveSameActiveSession(state.activeSession, expected)) {
      return conflict('stale-state', state);
    }

    if (state.history.some((session) => session.id === input.id)) {
      return { status: 'rejected', reason: 'session-id-conflict' };
    }

    const result = startSession(state.activeSession, input);

    if (result.status === 'applied') {
      await activeSessionItem.setValue(result.value);
    }

    return result;
  });
}

export async function pauseStoredSession(
  expected: RunningSession,
  atMs: TimestampMs,
): Promise<StoredTransitionResult<PausedSession>> {
  return persistActiveTransition(expected, (current) => pauseSession(current, atMs));
}

export async function resumeStoredSession(
  expected: PausedSession,
  atMs: TimestampMs,
): Promise<StoredTransitionResult<RunningSession>> {
  return persistActiveTransition(expected, (current) => resumeSession(current, atMs));
}

export async function cancelStoredSession(
  expected: ActiveSession,
): Promise<StoredTransitionResult<null>> {
  return executeStoredCommand(async (state) => {
    const completion = findCompletionForActiveSession(state);

    if (completion.status === 'incompatible') {
      return failed('invalid-stored-data');
    }

    if (!haveSameActiveSession(state.activeSession, expected)) {
      return conflict('stale-state', state);
    }

    if (completion.status === 'matching') {
      return conflict('finalization-pending', state);
    }

    const result = cancelSession(state.activeSession);

    if (result.status === 'applied') {
      await activeSessionItem.removeValue();
    }

    return result;
  });
}

export async function finishStoredSession(
  expected: ActiveSession,
  atMs: TimestampMs,
): Promise<StoredTransitionResult<CompletedSession>> {
  return executeStoredCommand(async (state) => {
    const completion = findCompletionForActiveSession(state);

    if (completion.status === 'incompatible') {
      return failed('invalid-stored-data');
    }

    if (!haveSameActiveSession(state.activeSession, expected)) {
      return conflict('stale-state', state);
    }

    if (completion.status === 'matching') {
      await activeSessionItem.removeValue();
      return { status: 'applied', value: completion.value };
    }

    const result = finishSession(state.activeSession, atMs);

    if (result.status !== 'applied') {
      return result;
    }

    await sessionHistoryItem.setValue([...state.history, result.value]);
    await activeSessionItem.removeValue();

    return result;
  });
}

async function persistActiveTransition<T extends ActiveSession>(
  expected: ActiveSession,
  transition: (current: ActiveSession | null) => TransitionResult<T>,
): Promise<StoredTransitionResult<T>> {
  return executeStoredCommand(async (state) => {
    const completion = findCompletionForActiveSession(state);

    if (completion.status === 'incompatible') {
      return failed('invalid-stored-data');
    }

    if (!haveSameActiveSession(state.activeSession, expected)) {
      return conflict('stale-state', state);
    }

    if (completion.status === 'matching') {
      return conflict('finalization-pending', state);
    }

    const result = transition(state.activeSession);

    if (result.status === 'applied') {
      await activeSessionItem.setValue(result.value);
    }

    return result;
  });
}

async function executeStoredCommand<T>(
  command: (state: StoredTimerState) => Promise<StoredTransitionResult<T>>,
): Promise<StoredTransitionResult<T>> {
  try {
    return await withSessionStorageLock(async () => {
      const storedState = await readStoredTimerStateUnlocked();

      return storedState.status === 'invalid'
        ? failed('invalid-stored-data')
        : command(storedState.value);
    });
  } catch (error) {
    return failed(classifyStorageFailure(error));
  }
}

async function readActiveSessionUnlocked(): Promise<SessionStorageRead<ActiveSession | null>> {
  return decodeActiveSession(await activeSessionItem.getValue());
}

async function readSessionHistoryUnlocked(): Promise<
  SessionStorageRead<readonly CompletedSession[]>
> {
  return decodeSessionHistory(await sessionHistoryItem.getValue());
}

async function readStoredTimerStateUnlocked(): Promise<SessionStorageRead<StoredTimerState>> {
  const [activeSession, history] = await Promise.all([
    readActiveSessionUnlocked(),
    readSessionHistoryUnlocked(),
  ]);

  return activeSession.status === 'invalid' || history.status === 'invalid'
    ? { status: 'invalid' }
    : {
        status: 'ready',
        value: { activeSession: activeSession.value, history: history.value },
      };
}

type ActiveCompletion =
  | { readonly status: 'none' }
  | { readonly status: 'matching'; readonly value: CompletedSession }
  | { readonly status: 'incompatible' };

function findCompletionForActiveSession(state: StoredTimerState): ActiveCompletion {
  if (!state.activeSession) {
    return { status: 'none' };
  }

  const completed = state.history.find((session) => session.id === state.activeSession?.id);

  if (!completed) {
    return { status: 'none' };
  }

  return isCompletionOfActiveSession(completed, state.activeSession)
    ? { status: 'matching', value: completed }
    : { status: 'incompatible' };
}

function haveSameActiveSession(left: ActiveSession | null, right: ActiveSession | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  if (!hasSameSessionContext(left, right) || left.state !== right.state) {
    return false;
  }

  if (!haveSamePeriods(left.periods, right.periods)) {
    return false;
  }

  return (
    left.state === 'paused' ||
    (right.state === 'running' && left.runningSinceMs === right.runningSinceMs)
  );
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

function hasSameSessionContext(
  left: ActiveSession | CompletedSession,
  right: ActiveSession | CompletedSession,
): boolean {
  return (
    left.id === right.id &&
    left.startedAtMs === right.startedAtMs &&
    left.task.id === right.task.id &&
    left.task.title === right.task.title &&
    left.taskList.id === right.taskList.id &&
    left.taskList.title === right.taskList.title
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

function conflict(
  reason: StoredTransitionConflict['reason'],
  state: StoredTimerState,
): StoredTransitionConflict {
  return { status: 'conflict', reason, state };
}

function failed<T>(reason: SessionPersistenceFailure): StoredTransitionResult<T> & {
  readonly status: 'failed';
} {
  return { status: 'failed', reason };
}
