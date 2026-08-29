import type { GoogleTaskListItem } from './task-lists';
import { listGoogleTaskListsPage } from './task-lists';
import type { GoogleTaskItem } from './tasks';
import { listGoogleTasksPage } from './tasks';
import type { GoogleTasksFailureReason } from './tasks-api-request';

export type GoogleTaskListIncompleteReason =
  | GoogleTasksFailureReason
  | 'authorization-required'
  | 'cancelled';

export type GoogleLoadedTaskList =
  | {
      readonly status: 'complete';
      readonly taskList: GoogleTaskListItem;
      readonly tasks: readonly GoogleTaskItem[];
    }
  | {
      readonly status: 'incomplete';
      readonly taskList: GoogleTaskListItem;
      readonly tasks: readonly GoogleTaskItem[];
      readonly reason: GoogleTaskListIncompleteReason;
    };

export type GoogleTaskListLoad =
  | GoogleLoadedTaskList
  | {
      readonly status: 'pending';
      readonly taskList: GoogleTaskListItem;
    };

export type GoogleTasksCatalogResult =
  | { readonly status: 'complete'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | { readonly status: 'partial'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | {
      readonly status: 'authorization-required';
      readonly taskLists: readonly GoogleTaskListLoad[];
    }
  | { readonly status: 'cancelled'; readonly taskLists: readonly GoogleTaskListLoad[] }
  | {
      readonly status: 'failed';
      readonly reason: GoogleTasksFailureReason;
      readonly taskLists: readonly GoogleTaskListLoad[];
    };

type TaskListPagesResult =
  | { readonly status: 'success'; readonly taskLists: readonly GoogleTaskListItem[] }
  | {
      readonly status: 'authorization-required' | 'cancelled';
      readonly taskLists: readonly GoogleTaskListItem[];
    }
  | {
      readonly status: 'failed';
      readonly reason: GoogleTasksFailureReason;
      readonly taskLists: readonly GoogleTaskListItem[];
    };

export async function loadGoogleTasksCatalog(
  accessToken: string,
  signal?: AbortSignal,
): Promise<GoogleTasksCatalogResult> {
  const taskListPages = await loadAllTaskListPages(accessToken, signal);

  if (taskListPages.status !== 'success') {
    const taskLists = taskListPages.taskLists.map(pendingTaskList);

    return taskListPages.status === 'failed'
      ? { status: 'failed', reason: taskListPages.reason, taskLists }
      : { status: taskListPages.status, taskLists };
  }

  const taskLists: GoogleTaskListLoad[] = [];

  for (const [index, taskList] of taskListPages.taskLists.entries()) {
    const loadedTaskList = await reloadGoogleTaskList(accessToken, taskList, signal);
    taskLists.push(loadedTaskList);

    if (loadedTaskList.status !== 'incomplete' || !isGlobalInterruption(loadedTaskList.reason)) {
      continue;
    }

    taskLists.push(...taskListPages.taskLists.slice(index + 1).map(pendingTaskList));

    if (loadedTaskList.reason === 'authorization-required') {
      return { status: 'authorization-required', taskLists };
    }

    if (loadedTaskList.reason === 'cancelled') {
      return { status: 'cancelled', taskLists };
    }

    return { status: 'failed', reason: loadedTaskList.reason, taskLists };
  }

  return taskLists.some((taskList) => taskList.status === 'incomplete')
    ? { status: 'partial', taskLists }
    : { status: 'complete', taskLists };
}

export async function reloadGoogleTaskList(
  accessToken: string,
  taskList: GoogleTaskListItem,
  signal?: AbortSignal,
): Promise<GoogleLoadedTaskList> {
  const tasks: GoogleTaskItem[] = [];
  const pageTokens = new Set<string>();
  let pageToken: string | undefined;

  while (true) {
    const result = await listGoogleTasksPage(accessToken, taskList.id, pageToken, signal);

    if (result.status !== 'success') {
      return {
        status: 'incomplete',
        taskList,
        tasks,
        reason: result.status === 'failed' ? result.reason : result.status,
      };
    }

    tasks.push(...result.value.items.filter(isEligibleTask));

    if (result.value.nextPageToken === undefined) {
      return { status: 'complete', taskList, tasks };
    }

    if (pageTokens.has(result.value.nextPageToken)) {
      return { status: 'incomplete', taskList, tasks, reason: 'invalid-response' };
    }

    pageTokens.add(result.value.nextPageToken);
    pageToken = result.value.nextPageToken;
  }
}

async function loadAllTaskListPages(
  accessToken: string,
  signal: AbortSignal | undefined,
): Promise<TaskListPagesResult> {
  const taskLists: GoogleTaskListItem[] = [];
  const pageTokens = new Set<string>();
  let pageToken: string | undefined;

  while (true) {
    const result = await listGoogleTaskListsPage(accessToken, pageToken, signal);

    if (result.status !== 'success') {
      return result.status === 'failed'
        ? { status: 'failed', reason: result.reason, taskLists }
        : { status: result.status, taskLists };
    }

    taskLists.push(...result.value.items);

    if (result.value.nextPageToken === undefined) {
      return { status: 'success', taskLists };
    }

    if (pageTokens.has(result.value.nextPageToken)) {
      return { status: 'failed', reason: 'invalid-response', taskLists };
    }

    pageTokens.add(result.value.nextPageToken);
    pageToken = result.value.nextPageToken;
  }
}

function isEligibleTask(task: GoogleTaskItem): boolean {
  return task.status === 'needsAction' && !task.deleted && !task.hidden && !task.assigned;
}

function isGlobalInterruption(
  reason: GoogleTaskListIncompleteReason,
): reason is 'authorization-required' | 'cancelled' | 'rate-limited' | 'unavailable' {
  return (
    reason === 'authorization-required' ||
    reason === 'cancelled' ||
    reason === 'rate-limited' ||
    reason === 'unavailable'
  );
}

function pendingTaskList(taskList: GoogleTaskListItem): GoogleTaskListLoad {
  return { status: 'pending', taskList };
}
