import {
  type GoogleTasksApiResult,
  invalidGoogleTasksRequest,
  isNonEmptyValue,
  requestGoogleTasks,
} from './tasks-api-request';

const TASK_LIST_FIELDS = 'nextPageToken,items(id,title)';

export interface GoogleTaskListItem {
  readonly id: string;
  readonly title: string;
}

export interface GoogleTaskListPage {
  readonly items: readonly GoogleTaskListItem[];
  readonly nextPageToken?: string;
}

export function listGoogleTaskListsPage(
  accessToken: string,
  pageToken?: string,
  signal?: AbortSignal,
): Promise<GoogleTasksApiResult<GoogleTaskListPage>> {
  if (pageToken !== undefined && !isNonEmptyValue(pageToken)) {
    return Promise.resolve(invalidGoogleTasksRequest());
  }

  return requestGoogleTasks(
    {
      accessToken,
      path: '/users/@me/lists',
      query: {
        maxResults: '1000',
        fields: TASK_LIST_FIELDS,
        ...(pageToken === undefined ? {} : { pageToken }),
      },
      ...(signal ? { signal } : {}),
    },
    decodeTaskListPage,
  );
}

function decodeTaskListPage(value: unknown): GoogleTaskListPage | null {
  if (!isRecord(value)) {
    return null;
  }

  const items = decodeItems(value.items, decodeTaskListItem);
  const nextPageToken = decodeOptionalNonEmptyString(value.nextPageToken);

  if (items === null || nextPageToken === null) {
    return null;
  }

  return {
    items,
    ...(nextPageToken === undefined ? {} : { nextPageToken }),
  };
}

function decodeTaskListItem(value: unknown): GoogleTaskListItem | null {
  if (!isRecord(value) || !isNonEmptyValueField(value.id) || typeof value.title !== 'string') {
    return null;
  }

  return { id: value.id, title: value.title };
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
