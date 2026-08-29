import { parseScheduledDate } from '../tasks/scheduled-date';
import {
  type GoogleTasksApiResult,
  invalidGoogleTasksRequest,
  isNonEmptyValue,
  requestGoogleTasks,
} from './tasks-api-request';

const TASK_FIELDS =
  'nextPageToken,items(id,title,parent,position,status,due,deleted,hidden,assignmentInfo(surfaceType))';
const COMPLETION_FIELDS = 'id,status,completed';

export type GoogleTaskStatus = 'needsAction' | 'completed';

export interface GoogleTaskItem {
  readonly id: string;
  readonly title: string;
  readonly parentId?: string;
  readonly position: string;
  readonly status: GoogleTaskStatus;
  readonly due?: string;
  readonly deleted: boolean;
  readonly hidden: boolean;
  readonly assigned: boolean;
}

export interface GoogleTaskPage {
  readonly items: readonly GoogleTaskItem[];
  readonly nextPageToken?: string;
}

export interface GoogleTaskCompletion {
  readonly id: string;
  readonly status: 'completed';
  readonly completed?: string;
}

export function listGoogleTasksPage(
  accessToken: string,
  taskListId: string,
  pageToken?: string,
  signal?: AbortSignal,
): Promise<GoogleTasksApiResult<GoogleTaskPage>> {
  if (!isNonEmptyValue(taskListId) || (pageToken !== undefined && !isNonEmptyValue(pageToken))) {
    return Promise.resolve(invalidGoogleTasksRequest());
  }

  return requestGoogleTasks(
    {
      accessToken,
      path: `/lists/${encodeURIComponent(taskListId)}/tasks`,
      query: {
        maxResults: '100',
        showCompleted: 'false',
        showDeleted: 'false',
        showHidden: 'false',
        showAssigned: 'false',
        fields: TASK_FIELDS,
        ...(pageToken === undefined ? {} : { pageToken }),
      },
      ...(signal ? { signal } : {}),
    },
    decodeTaskPage,
  );
}

export function completeGoogleTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<GoogleTasksApiResult<GoogleTaskCompletion>> {
  if (!isNonEmptyValue(taskListId) || !isNonEmptyValue(taskId)) {
    return Promise.resolve(invalidGoogleTasksRequest());
  }

  return requestGoogleTasks(
    {
      accessToken,
      path: `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      query: { fields: COMPLETION_FIELDS },
      method: 'PATCH',
      body: { status: 'completed' },
      ...(signal ? { signal } : {}),
    },
    decodeTaskCompletion,
  );
}

function decodeTaskPage(value: unknown): GoogleTaskPage | null {
  if (!isRecord(value)) {
    return null;
  }

  const items = decodeItems(value.items, decodeTaskItem);
  const nextPageToken = decodeOptionalNonEmptyString(value.nextPageToken);

  if (items === null || nextPageToken === null) {
    return null;
  }

  return {
    items,
    ...(nextPageToken === undefined ? {} : { nextPageToken }),
  };
}

function decodeTaskItem(value: unknown): GoogleTaskItem | null {
  if (
    !isRecord(value) ||
    !isNonEmptyValueField(value.id) ||
    typeof value.title !== 'string' ||
    !isNonEmptyValueField(value.position) ||
    !isTaskStatus(value.status) ||
    !isOptionalNonEmptyString(value.parent) ||
    !isOptionalScheduledDate(value.due) ||
    !isOptionalBoolean(value.deleted) ||
    !isOptionalBoolean(value.hidden) ||
    !isOptionalAssignment(value.assignmentInfo)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    ...(value.parent === undefined ? {} : { parentId: value.parent }),
    position: value.position,
    status: value.status,
    ...(value.due === undefined ? {} : { due: value.due }),
    deleted: value.deleted ?? false,
    hidden: value.hidden ?? false,
    assigned: value.assignmentInfo !== undefined,
  };
}

function decodeTaskCompletion(value: unknown): GoogleTaskCompletion | null {
  if (
    !isRecord(value) ||
    !isNonEmptyValueField(value.id) ||
    value.status !== 'completed' ||
    !isOptionalNonEmptyString(value.completed)
  ) {
    return null;
  }

  return {
    id: value.id,
    status: 'completed',
    ...(value.completed === undefined ? {} : { completed: value.completed }),
  };
}

function decodeItems<T>(value: unknown, decode: (item: unknown) => T | null): readonly T[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const decoded: T[] = [];

  for (const item of value) {
    const result = decode(item);

    if (result === null) {
      return null;
    }

    decoded.push(result);
  }

  return decoded;
}

function decodeOptionalNonEmptyString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return isNonEmptyValueField(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyValueField(value: unknown): value is string {
  return typeof value === 'string' && isNonEmptyValue(value);
}

function isTaskStatus(value: unknown): value is GoogleTaskStatus {
  return value === 'needsAction' || value === 'completed';
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyValueField(value);
}

function isOptionalScheduledDate(value: unknown): value is string | undefined {
  return value === undefined || (isNonEmptyValueField(value) && parseScheduledDate(value) !== null);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalAssignment(value: unknown): boolean {
  return value === undefined || (isRecord(value) && isNonEmptyValueField(value.surfaceType));
}
