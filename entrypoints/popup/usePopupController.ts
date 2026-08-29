import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GoogleAuthorizationResult,
  getGoogleAuthorization,
  renewGoogleAuthorization,
  requestGoogleAuthorization,
} from '../../src/google/authorization';
import {
  type GoogleTaskListLoad,
  type GoogleTasksCatalogProgressListener,
  type GoogleTasksCatalogResult,
  loadGoogleTasksCatalog,
} from '../../src/google/tasks-catalog';
import {
  cancelStoredSession,
  findPendingSessionCompletion,
  finishStoredSession,
  observeStoredTimerState,
  pauseStoredSession,
  resumeStoredSession,
  type SessionPersistenceFailure,
  type StoredTimerState,
  type StoredTimerStateObservation,
  type StoredTransitionResult,
  startStoredSession,
} from '../../src/storage/session-storage';
import { getLocalCivilDate } from '../../src/tasks/scheduled-date';
import { type PrioritizedGoogleTask, prioritizeGoogleTasks } from '../../src/tasks/task-priority';
import { calculateDailyTotal } from '../../src/timer/daily-total';
import { calculateActiveSessionDuration } from '../../src/timer/duration';
import type { ActiveSession, DurationMs, TimestampMs } from '../../src/timer/session';
import type { TransitionRejection } from '../../src/timer/transitions';

export interface PopupDependencies {
  readonly getAuthorization: () => Promise<GoogleAuthorizationResult>;
  readonly requestAuthorization: () => Promise<GoogleAuthorizationResult>;
  readonly renewAuthorization: (invalidToken: string) => Promise<GoogleAuthorizationResult>;
  readonly loadTasksCatalog: (
    accessToken: string,
    signal?: AbortSignal,
    onProgress?: GoogleTasksCatalogProgressListener,
  ) => Promise<GoogleTasksCatalogResult>;
  readonly observeTimerState: (
    listener: (observation: StoredTimerStateObservation) => void,
  ) => () => void;
  readonly startStoredSession: typeof startStoredSession;
  readonly pauseStoredSession: typeof pauseStoredSession;
  readonly resumeStoredSession: typeof resumeStoredSession;
  readonly finishStoredSession: typeof finishStoredSession;
  readonly cancelStoredSession: typeof cancelStoredSession;
  readonly createSessionId: () => string;
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
  readonly finalizationPending: boolean;
  readonly historyCount: number;
}

export interface PopupController {
  readonly google: PopupGoogleState;
  readonly local: PopupLocalState;
  readonly taskCount: number;
  readonly prioritizedTasks: readonly PrioritizedGoogleTask[];
  readonly sessionSelection: PopupSessionSelectionState;
  readonly timerControls: PopupTimerControlsState;
  readonly connectGoogle: () => void;
  readonly retryGoogle: () => void;
  readonly selectTask: (taskListId: string, taskId: string) => void;
  readonly startSelectedSession: () => void;
  readonly pauseActiveSession: () => void;
  readonly resumeActiveSession: () => void;
  readonly finishActiveSession: () => void;
  readonly cancelActiveSession: () => void;
}

export type PopupSessionSelectionState =
  | { readonly status: 'blocked'; readonly reason: PopupSessionSelectionBlock }
  | { readonly status: 'selecting'; readonly selectedTask: PrioritizedGoogleTask | null }
  | { readonly status: 'starting'; readonly selectedTask: PrioritizedGoogleTask }
  | {
      readonly status: 'failed';
      readonly reason: 'storage-full' | 'unavailable';
      readonly selectedTask: PrioritizedGoogleTask;
    };

type PopupSessionSelectionBlock = 'local-loading' | 'local-unavailable' | 'active-session';

export type PopupTimerAction = 'pause' | 'resume' | 'finish' | 'cancel';

export type PopupTimerFailure =
  | 'storage-full'
  | 'storage-unavailable'
  | 'invalid-local-data'
  | 'invalid-clock'
  | 'state-changed';

export type PopupTimerControlsState =
  | { readonly status: 'idle' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'working'; readonly action: PopupTimerAction }
  | {
      readonly status: 'failed';
      readonly action: PopupTimerAction;
      readonly reason: PopupTimerFailure;
    }
  | { readonly status: 'conflict' }
  | { readonly status: 'finalization-pending' }
  | { readonly status: 'succeeded'; readonly action: 'finish' | 'cancel' };

const defaultDependencies: PopupDependencies = {
  getAuthorization: getGoogleAuthorization,
  requestAuthorization: requestGoogleAuthorization,
  renewAuthorization: renewGoogleAuthorization,
  loadTasksCatalog: loadGoogleTasksCatalog,
  observeTimerState: observeStoredTimerState,
  startStoredSession,
  pauseStoredSession,
  resumeStoredSession,
  finishStoredSession,
  cancelStoredSession,
  createSessionId: () => globalThis.crypto.randomUUID(),
  now: Date.now,
};

interface ActiveOperation {
  readonly id: number;
  readonly controller: AbortController;
}

type AuthorizationMode = 'initial' | 'interactive' | 'retry';

interface SelectedTaskKey {
  readonly taskListId: string;
  readonly taskId: string;
}

type SessionStartStatus = 'idle' | 'starting' | 'storage-full' | 'unavailable';

type TimerActionStatus = Exclude<PopupTimerControlsState, { readonly status: 'unavailable' }>;

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
  const [selectedTaskKey, setSelectedTaskKey] = useState<SelectedTaskKey | null>(null);
  const [startingTask, setStartingTask] = useState<PrioritizedGoogleTask | null>(null);
  const [sessionStartStatus, setSessionStartStatus] = useState<SessionStartStatus>('idle');
  const [timerActionStatus, setTimerActionStatus] = useState<TimerActionStatus>({ status: 'idle' });
  const googleRef = useRef(google);
  const nextOperationId = useRef(0);
  const activeOperation = useRef<ActiveOperation | null>(null);
  const startInFlight = useRef(false);
  const timerActionInFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

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
      const onProgress = createProgressListener(
        operation,
        previousTaskLists,
        isCurrentOperation,
        commitGoogleState,
      );
      let result = await dependencies.loadTasksCatalog(
        authorization.accessToken,
        operation.controller.signal,
        onProgress,
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
            onProgress,
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

  const prioritizedTasks = useMemo(
    () => prioritizeGoogleTasks(google.taskLists, getLocalCivilDate(nowMs)),
    [google.taskLists, nowMs],
  );
  const selectedTask = useMemo(
    () => findSelectedTask(prioritizedTasks, selectedTaskKey),
    [prioritizedTasks, selectedTaskKey],
  );

  useEffect(() => {
    if (storedTimerState.status === 'ready' && storedTimerState.value.activeSession) {
      setSelectedTaskKey(null);
      setStartingTask(null);
      setSessionStartStatus('idle');
      return;
    }

    if (selectedTaskKey && !selectedTask && !startInFlight.current) {
      setSelectedTaskKey(null);
      setStartingTask(null);
      setSessionStartStatus('idle');
    }
  }, [selectedTask, selectedTaskKey, storedTimerState]);

  const selectTask = useCallback(
    (taskListId: string, taskId: string) => {
      if (
        startInFlight.current ||
        storedTimerState.status !== 'ready' ||
        storedTimerState.value.activeSession ||
        !findTask(prioritizedTasks, taskListId, taskId)
      ) {
        return;
      }

      setSelectedTaskKey({ taskListId, taskId });
      setSessionStartStatus('idle');
    },
    [prioritizedTasks, storedTimerState],
  );

  const startSelectedSession = useCallback(async () => {
    if (
      startInFlight.current ||
      !selectedTask ||
      storedTimerState.status !== 'ready' ||
      storedTimerState.value.activeSession
    ) {
      return;
    }

    startInFlight.current = true;
    setStartingTask(selectedTask);
    setSessionStartStatus('starting');

    try {
      const result = await dependencies.startStoredSession(null, {
        id: dependencies.createSessionId(),
        task: { id: selectedTask.task.id, title: selectedTask.task.title },
        taskList: { id: selectedTask.taskList.id, title: selectedTask.taskList.title },
        startedAtMs: dependencies.now(),
      });

      if (!mounted.current) {
        return;
      }

      if (result.status === 'applied' || result.status === 'unchanged') {
        setStoredTimerState((current) =>
          current.status === 'loading' || !current.value
            ? current
            : {
                status: 'ready',
                value: { activeSession: result.value, history: current.value.history },
              },
        );
        setSelectedTaskKey(null);
        setStartingTask(null);
        setSessionStartStatus('idle');
        setTimerActionStatus({ status: 'idle' });
        return;
      }

      if (result.status === 'conflict') {
        setStoredTimerState({ status: 'ready', value: result.state });
        setSelectedTaskKey(null);
        setStartingTask(null);
        setSessionStartStatus('idle');
        setTimerActionStatus({ status: 'idle' });
        return;
      }

      setStartingTask(null);
      setSessionStartStatus(
        result.status === 'failed' && result.reason === 'quota-exceeded'
          ? 'storage-full'
          : 'unavailable',
      );
    } catch {
      if (mounted.current) {
        setStartingTask(null);
        setSessionStartStatus('unavailable');
      }
    } finally {
      startInFlight.current = false;
    }
  }, [dependencies, selectedTask, storedTimerState]);

  const executeTimerAction = useCallback(
    async <T>(
      action: PopupTimerAction,
      baseState: StoredTimerState,
      command: () => Promise<StoredTransitionResult<T>>,
      applyValue: (state: StoredTimerState, value: T) => StoredTimerState,
    ): Promise<void> => {
      if (timerActionInFlight.current) {
        return;
      }

      timerActionInFlight.current = true;
      setTimerActionStatus({ status: 'working', action });

      try {
        const result = await command();

        if (!mounted.current) {
          return;
        }

        if (result.status === 'applied' || result.status === 'unchanged') {
          setStoredTimerState((current) => {
            const currentState =
              current.status === 'loading' || !current.value ? baseState : current.value;

            return { status: 'ready', value: applyValue(currentState, result.value) };
          });
          setTimerActionStatus(
            action === 'finish' || action === 'cancel'
              ? { status: 'succeeded', action }
              : { status: 'idle' },
          );
          return;
        }

        if (result.status === 'conflict') {
          setStoredTimerState({ status: 'ready', value: result.state });
          setTimerActionStatus(
            result.reason === 'finalization-pending' ? { status: 'idle' } : { status: 'conflict' },
          );
          return;
        }

        setTimerActionStatus({
          status: 'failed',
          action,
          reason: mapTimerActionFailure(result),
        });
      } catch {
        if (mounted.current) {
          setTimerActionStatus({ status: 'failed', action, reason: 'storage-unavailable' });
        }
      } finally {
        timerActionInFlight.current = false;
      }
    },
    [],
  );

  const pauseActiveSession = useCallback(() => {
    if (storedTimerState.status !== 'ready') {
      return;
    }

    const state = storedTimerState.value;
    const session = state.activeSession;

    if (session?.state !== 'running') {
      return;
    }

    void executeTimerAction(
      'pause',
      state,
      () => dependencies.pauseStoredSession(session, dependencies.now()),
      (current, value) => ({ ...current, activeSession: value }),
    );
  }, [dependencies, executeTimerAction, storedTimerState]);

  const resumeActiveSession = useCallback(() => {
    if (storedTimerState.status !== 'ready') {
      return;
    }

    const state = storedTimerState.value;
    const session = state.activeSession;

    if (session?.state !== 'paused') {
      return;
    }

    void executeTimerAction(
      'resume',
      state,
      () => dependencies.resumeStoredSession(session, dependencies.now()),
      (current, value) => ({ ...current, activeSession: value }),
    );
  }, [dependencies, executeTimerAction, storedTimerState]);

  const finishActiveSession = useCallback(() => {
    if (storedTimerState.status !== 'ready') {
      return;
    }

    const state = storedTimerState.value;
    const session = state.activeSession;

    if (!session) {
      return;
    }

    void executeTimerAction(
      'finish',
      state,
      () => dependencies.finishStoredSession(session, dependencies.now()),
      (current, value) => ({
        activeSession: null,
        history: current.history.some((completed) => completed.id === value.id)
          ? current.history
          : [...current.history, value],
      }),
    );
  }, [dependencies, executeTimerAction, storedTimerState]);

  const cancelActiveSession = useCallback(() => {
    if (storedTimerState.status !== 'ready') {
      return;
    }

    const state = storedTimerState.value;
    const session = state.activeSession;

    if (!session) {
      return;
    }

    void executeTimerAction(
      'cancel',
      state,
      () => dependencies.cancelStoredSession(session),
      (current) => ({ ...current, activeSession: null }),
    );
  }, [dependencies, executeTimerAction, storedTimerState]);

  const sessionSelection = createSessionSelectionState(
    storedTimerState,
    sessionStartStatus === 'starting' ? (startingTask ?? selectedTask) : selectedTask,
    sessionStartStatus,
  );
  const timerControls = createTimerControlsState(storedTimerState, timerActionStatus);

  return {
    google,
    local,
    taskCount: countTasks(google.taskLists),
    prioritizedTasks,
    sessionSelection,
    timerControls,
    connectGoogle: () => void authorizeAndLoad('interactive'),
    retryGoogle: () => void authorizeAndLoad('retry'),
    selectTask,
    startSelectedSession: () => void startSelectedSession(),
    pauseActiveSession,
    resumeActiveSession,
    finishActiveSession,
    cancelActiveSession,
  };
}

function findSelectedTask(
  tasks: readonly PrioritizedGoogleTask[],
  key: SelectedTaskKey | null,
): PrioritizedGoogleTask | null {
  return key ? findTask(tasks, key.taskListId, key.taskId) : null;
}

function findTask(
  tasks: readonly PrioritizedGoogleTask[],
  taskListId: string,
  taskId: string,
): PrioritizedGoogleTask | null {
  return tasks.find((item) => item.taskList.id === taskListId && item.task.id === taskId) ?? null;
}

function createSessionSelectionState(
  storedState:
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly value: StoredTimerState }
    | { readonly status: 'error'; readonly value?: StoredTimerState },
  selectedTask: PrioritizedGoogleTask | null,
  startStatus: SessionStartStatus,
): PopupSessionSelectionState {
  if (storedState.status === 'loading') {
    return { status: 'blocked', reason: 'local-loading' };
  }

  if (storedState.status === 'error') {
    return { status: 'blocked', reason: 'local-unavailable' };
  }

  if (storedState.value.activeSession) {
    return { status: 'blocked', reason: 'active-session' };
  }

  if (!selectedTask) {
    return { status: 'selecting', selectedTask: null };
  }

  if (startStatus === 'starting') {
    return { status: 'starting', selectedTask };
  }

  if (startStatus === 'storage-full' || startStatus === 'unavailable') {
    return {
      status: 'failed',
      reason: startStatus,
      selectedTask,
    };
  }

  return { status: 'selecting', selectedTask };
}

function createTimerControlsState(
  storedState:
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly value: StoredTimerState }
    | { readonly status: 'error'; readonly value?: StoredTimerState },
  actionStatus: TimerActionStatus,
): PopupTimerControlsState {
  if (storedState.status !== 'ready') {
    return { status: 'unavailable' };
  }

  if (actionStatus.status === 'working') {
    return actionStatus;
  }

  if (findPendingSessionCompletion(storedState.value)) {
    return { status: 'finalization-pending' };
  }

  return actionStatus;
}

function mapTimerActionFailure(
  result:
    | { readonly status: 'failed'; readonly reason: SessionPersistenceFailure }
    | { readonly status: 'rejected'; readonly reason: TransitionRejection },
): PopupTimerFailure {
  if (result.status === 'rejected') {
    return result.reason === 'invalid-timestamp' || result.reason === 'timestamp-out-of-order'
      ? 'invalid-clock'
      : 'state-changed';
  }

  switch (result.reason) {
    case 'quota-exceeded':
      return 'storage-full';
    case 'invalid-stored-data':
      return 'invalid-local-data';
    case 'storage-unavailable':
      return 'storage-unavailable';
  }
}

function createProgressListener(
  operation: ActiveOperation,
  previousTaskLists: readonly GoogleTaskListLoad[],
  isCurrentOperation: (operation: ActiveOperation) => boolean,
  commitGoogleState: (state: PopupGoogleState) => void,
): GoogleTasksCatalogProgressListener | undefined {
  if (previousTaskLists.length > 0) {
    return undefined;
  }

  return ({ taskLists }) => {
    if (isCurrentOperation(operation)) {
      commitGoogleState({ status: 'loading', taskLists });
    }
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
  const pendingCompletion = findPendingSessionCompletion(state);

  return {
    activeSession: state.activeSession,
    activeDurationMs:
      pendingCompletion?.durationMs ??
      (state.activeSession ? calculateActiveSessionDuration(state.activeSession, nowMs) : 0),
    dailyTotalMs: calculateDailyTotal({
      activeSession: pendingCompletion ? null : state.activeSession,
      completedSessions: state.history,
      nowMs,
    }),
    finalizationPending: pendingCompletion !== null,
    historyCount: state.history.length,
  };
}
