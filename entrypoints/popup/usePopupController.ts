import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GoogleAuthorizationResult,
  getGoogleAuthorization,
  renewGoogleAuthorization,
  requestGoogleAuthorization,
} from '../../src/google/authorization';
import {
  type GoogleTaskListLoad,
  type GoogleTasksCatalogResult,
  loadGoogleTasksCatalog,
} from '../../src/google/tasks-catalog';
import {
  observeStoredTimerState,
  type StoredTimerState,
  type StoredTimerStateObservation,
} from '../../src/storage/session-storage';
import { calculateDailyTotal } from '../../src/timer/daily-total';
import { calculateActiveSessionDuration } from '../../src/timer/duration';
import type { ActiveSession, DurationMs, TimestampMs } from '../../src/timer/session';

export interface PopupDependencies {
  readonly getAuthorization: () => Promise<GoogleAuthorizationResult>;
  readonly requestAuthorization: () => Promise<GoogleAuthorizationResult>;
  readonly renewAuthorization: (invalidToken: string) => Promise<GoogleAuthorizationResult>;
  readonly loadTasksCatalog: (
    accessToken: string,
    signal?: AbortSignal,
  ) => Promise<GoogleTasksCatalogResult>;
  readonly observeTimerState: (
    listener: (observation: StoredTimerStateObservation) => void,
  ) => () => void;
  readonly now: () => TimestampMs;
}

export type PopupGoogleState =
  | { readonly status: 'checking'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'disconnected'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'connecting'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'loading'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'ready'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'empty'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'partial'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'offline'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'error'; readonly taskLists: readonly GoogleTaskListLoad[] };

export type PopupLocalState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: PopupLocalSummary }
  | { readonly status: 'error'; readonly value?: PopupLocalSummary };

export interface PopupLocalSummary {
  readonly activeSession: ActiveSession | null;
  readonly activeDurationMs: DurationMs;
  readonly dailyTotalMs: DurationMs;
  readonly historyCount: number;
}

export interface PopupController {
  readonly google: PopupGoogleState;
  readonly local: PopupLocalState;
  readonly taskCount: number;
  readonly connectGoogle: () => void;
  readonly retryGoogle: () => void;
}

const defaultDependencies: PopupDependencies = {
  getAuthorization: getGoogleAuthorization,
  requestAuthorization: requestGoogleAuthorization,
  renewAuthorization: renewGoogleAuthorization,
  loadTasksCatalog: loadGoogleTasksCatalog,
  observeTimerState: observeStoredTimerState,
  now: Date.now,
};

interface ActiveOperation {
  readonly id: number;
  readonly controller: AbortController;
}

type AuthorizationMode = 'initial' | 'interactive' | 'retry';

export function usePopupController(
  dependencies: PopupDependencies = defaultDependencies,
): PopupController {
  const [google, setGoogle] = useState<PopupGoogleState>({ status: 'checking', taskLists: [] });
  const [storedTimerState, setStoredTimerState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly value: StoredTimerState }
    | { readonly status: 'error'; readonly value?: StoredTimerState }
  >({ status: 'loading' });
  const [nowMs, setNowMs] = useState(dependencies.now);
  const googleRef = useRef(google);
  const nextOperationId = useRef(0);
  const activeOperation = useRef<ActiveOperation | null>(null);

  const commitGoogleState = useCallback((state: PopupGoogleState) => {
    googleRef.current = state;
    setGoogle(state);
  }, []);

  const isCurrentOperation = useCallback((operation: ActiveOperation): boolean => {
    return activeOperation.current?.id === operation.id && !operation.controller.signal.aborted;
  }, []);

  const startOperation = useCallback(
    (status: 'checking' | 'connecting' | 'loading'): ActiveOperation => {
      activeOperation.current?.controller.abort();

      const operation = {
        id: ++nextOperationId.current,
        controller: new AbortController(),
      };
      activeOperation.current = operation;
      commitGoogleState({ status, taskLists: googleRef.current.taskLists });

      return operation;
    },
    [commitGoogleState],
  );

  const finishOperation = useCallback((operation: ActiveOperation) => {
    if (activeOperation.current?.id === operation.id) {
      activeOperation.current = null;
    }
  }, []);

  const loadAuthorizedCatalog = useCallback(
    async (
      operation: ActiveOperation,
      authorization: Extract<GoogleAuthorizationResult, { readonly status: 'authorized' }>,
      previousTaskLists: readonly GoogleTaskListLoad[],
    ): Promise<void> => {
      commitGoogleState({ status: 'loading', taskLists: previousTaskLists });
      let result = await dependencies.loadTasksCatalog(
        authorization.accessToken,
        operation.controller.signal,
      );

      if (!isCurrentOperation(operation)) {
        return;
      }

      if (result.status === 'authorization-required') {
        const renewal = await dependencies.renewAuthorization(authorization.accessToken);

        if (!isCurrentOperation(operation)) {
          return;
        }

        if (renewal.status === 'authorized') {
          result = await dependencies.loadTasksCatalog(
            renewal.accessToken,
            operation.controller.signal,
          );

          if (!isCurrentOperation(operation)) {
            return;
          }
        } else {
          const taskLists = preserveTaskLists(previousTaskLists, result.taskLists);
          commitGoogleState({
            status: renewal.status === 'authorization-required' ? 'disconnected' : 'error',
            taskLists,
          });
          finishOperation(operation);
          return;
        }
      }

      commitGoogleState(mapCatalogResult(result, previousTaskLists));
      finishOperation(operation);
    },
    [commitGoogleState, dependencies, finishOperation, isCurrentOperation],
  );

  const authorizeAndLoad = useCallback(
    async (mode: AuthorizationMode): Promise<void> => {
      const previousTaskLists = googleRef.current.taskLists;
      const operation = startOperation(
        mode === 'interactive' ? 'connecting' : mode === 'retry' ? 'loading' : 'checking',
      );
      const authorization =
        mode === 'interactive'
          ? await dependencies.requestAuthorization()
          : await dependencies.getAuthorization();

      if (!isCurrentOperation(operation)) {
        return;
      }

      if (authorization.status !== 'authorized') {
        commitGoogleState({
          status: authorization.status === 'authorization-required' ? 'disconnected' : 'error',
          taskLists: previousTaskLists,
        });
        finishOperation(operation);
        return;
      }

      await loadAuthorizedCatalog(operation, authorization, previousTaskLists);
    },
    [
      commitGoogleState,
      dependencies,
      finishOperation,
      isCurrentOperation,
      loadAuthorizedCatalog,
      startOperation,
    ],
  );

  useEffect(() => {
    void authorizeAndLoad('initial');

    return () => {
      activeOperation.current?.controller.abort();
      activeOperation.current = null;
    };
  }, [authorizeAndLoad]);

  useEffect(() => {
    let stopObserving: () => void = () => {};

    try {
      stopObserving = dependencies.observeTimerState((observation) => {
        if (observation.status === 'ready') {
          setStoredTimerState({ status: 'ready', value: observation.value });
          return;
        }

        setStoredTimerState((current) => {
          const value = current.status === 'loading' ? undefined : current.value;

          return { status: 'error', ...(value ? { value } : {}) };
        });
      });
    } catch {
      setStoredTimerState({ status: 'error' });
    }

    return stopObserving;
  }, [dependencies]);

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNowMs(dependencies.now()), 1_000);

    return () => globalThis.clearInterval(interval);
  }, [dependencies]);

  const local = useMemo<PopupLocalState>(() => {
    if (storedTimerState.status === 'loading') {
      return { status: 'loading' };
    }

    if (!storedTimerState.value) {
      return { status: 'error' };
    }

    const summary = createLocalSummary(storedTimerState.value, nowMs);

    return storedTimerState.status === 'ready'
      ? { status: 'ready', value: summary }
      : { status: 'error', value: summary };
  }, [nowMs, storedTimerState]);

  return {
    google,
    local,
    taskCount: countTasks(google.taskLists),
    connectGoogle: () => void authorizeAndLoad('interactive'),
    retryGoogle: () => void authorizeAndLoad('retry'),
  };
}

function mapCatalogResult(
  result: GoogleTasksCatalogResult,
  previousTaskLists: readonly GoogleTaskListLoad[],
): PopupGoogleState {
  switch (result.status) {
    case 'complete':
      return {
        status: countTasks(result.taskLists) === 0 ? 'empty' : 'ready',
        taskLists: result.taskLists,
      };
    case 'partial':
      return { status: 'partial', taskLists: result.taskLists };
    case 'authorization-required':
      return {
        status: 'disconnected',
        taskLists: preserveTaskLists(previousTaskLists, result.taskLists),
      };
    case 'cancelled':
      return {
        status: 'error',
        taskLists: preserveTaskLists(previousTaskLists, result.taskLists),
      };
    case 'failed':
      return {
        status: result.reason === 'unavailable' ? 'offline' : 'error',
        taskLists: preserveTaskLists(previousTaskLists, result.taskLists),
      };
  }
}

function preserveTaskLists(
  previousTaskLists: readonly GoogleTaskListLoad[],
  currentTaskLists: readonly GoogleTaskListLoad[],
): readonly GoogleTaskListLoad[] {
  return previousTaskLists.length > 0 ? previousTaskLists : currentTaskLists;
}

function countTasks(taskLists: readonly GoogleTaskListLoad[]): number {
  return taskLists.reduce(
    (count, taskList) => count + (taskList.status === 'pending' ? 0 : taskList.tasks.length),
    0,
  );
}

function createLocalSummary(state: StoredTimerState, nowMs: TimestampMs): PopupLocalSummary {
  return {
    activeSession: state.activeSession,
    activeDurationMs: state.activeSession
      ? calculateActiveSessionDuration(state.activeSession, nowMs)
      : 0,
    dailyTotalMs: calculateDailyTotal({
      activeSession: state.activeSession,
      completedSessions: state.history,
      nowMs,
    }),
    historyCount: state.history.length,
  };
}
