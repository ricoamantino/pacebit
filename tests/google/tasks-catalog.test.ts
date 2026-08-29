import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleTaskItem } from '../../src/google/tasks';
import {
  type GoogleTaskListLoad,
  loadGoogleTasksCatalog,
  reloadGoogleTaskList,
} from '../../src/google/tasks-catalog';

const ACCESS_TOKEN = 'controlled-access-token';
const FIRST_LIST = { id: 'list-1', title: 'Trabalho' } as const;
const SECOND_LIST = { id: 'list-2', title: 'Pessoal' } as const;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Google Tasks catalog', () => {
  it('loads every list and task page sequentially while preserving eligible task order', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST], nextPageToken: 'lists-page-2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [SECOND_LIST] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            task({ id: 'parent', title: 'Pai' }),
            task({ id: 'completed', status: 'completed' }),
            task({ id: 'deleted', deleted: true }),
          ],
          nextPageToken: 'tasks-page-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            task({ id: 'child', title: 'Subtarefa', parent: 'parent', due: '2026-08-30' }),
            task({ id: 'hidden', hidden: true }),
            task({ id: 'assigned', assignmentInfo: { surfaceType: 'DOCUMENT' } }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'personal' })] }));

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'complete',
      taskLists: [
        {
          status: 'complete',
          taskList: FIRST_LIST,
          tasks: [
            decodedTask({ id: 'parent', title: 'Pai' }),
            decodedTask({
              id: 'child',
              title: 'Subtarefa',
              parentId: 'parent',
              due: '2026-08-30',
            }),
          ],
        },
        {
          status: 'complete',
          taskList: SECOND_LIST,
          tasks: [decodedTask({ id: 'personal' })],
        },
      ],
    });

    expect(requestSummary()).toEqual([
      ['lists', undefined],
      ['lists', 'lists-page-2'],
      ['list-1', undefined],
      ['list-1', 'tasks-page-2'],
      ['list-2', undefined],
    ]);
  });

  it('returns a complete empty catalog when the account has no task lists', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'complete',
      taskLists: [],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('represents a task list without tasks as complete', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST] }))
      .mockResolvedValueOnce(jsonResponse({}));

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'complete',
      taskLists: [{ status: 'complete', taskList: FIRST_LIST, tasks: [] }],
    });
  });

  it('keeps a list-specific first-page failure and continues with later lists', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
      .mockResolvedValueOnce(httpFailure(403))
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'later-list-task' })] }));

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'partial',
      taskLists: [
        {
          status: 'incomplete',
          taskList: FIRST_LIST,
          tasks: [],
          reason: 'forbidden',
        },
        {
          status: 'complete',
          taskList: SECOND_LIST,
          tasks: [decodedTask({ id: 'later-list-task' })],
        },
      ],
    });
  });

  it('keeps valid pages after a later list-specific task failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'kept' })], nextPageToken: 'next' }))
      .mockResolvedValueOnce(httpFailure(404))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await loadGoogleTasksCatalog(ACCESS_TOKEN);

    expect(result).toEqual({
      status: 'partial',
      taskLists: [
        {
          status: 'incomplete',
          taskList: FIRST_LIST,
          tasks: [decodedTask({ id: 'kept' })],
          reason: 'not-found',
        },
        { status: 'complete', taskList: SECOND_LIST, tasks: [] },
      ],
    });
  });

  it.each([
    [401, 'authorization-required'],
    [429, 'failed'],
    [503, 'failed'],
  ] as const)(
    'stops after a global HTTP %i interruption and marks later lists pending',
    async (httpStatus, expectedStatus) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
        .mockResolvedValueOnce(
          jsonResponse({ items: [task({ id: 'kept' })], nextPageToken: 'next' }),
        )
        .mockResolvedValueOnce(httpFailure(httpStatus));

      const result = await loadGoogleTasksCatalog(ACCESS_TOKEN);

      expect(result.status).toBe(expectedStatus);
      expect(result.taskLists).toEqual([
        {
          status: 'incomplete',
          taskList: FIRST_LIST,
          tasks: [decodedTask({ id: 'kept' })],
          reason:
            httpStatus === 401
              ? 'authorization-required'
              : httpStatus === 429
                ? 'rate-limited'
                : 'unavailable',
        },
        { status: 'pending', taskList: SECOND_LIST },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it('stops after a network failure without loading a later list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'first' })] }))
      .mockRejectedValueOnce(new Error('controlled network failure'));

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'failed',
      reason: 'unavailable',
      taskLists: [
        {
          status: 'complete',
          taskList: FIRST_LIST,
          tasks: [decodedTask({ id: 'first' })],
        },
        {
          status: 'incomplete',
          taskList: SECOND_LIST,
          tasks: [],
          reason: 'unavailable',
        },
      ],
    });
  });

  it('cancels the current list, preserves its tasks and leaves later lists pending', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'kept' })], nextPageToken: 'next' }))
      .mockImplementationOnce(
        (_url: URL, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('controlled abort', 'AbortError'));
            });
          }),
      );

    const loading = loadGoogleTasksCatalog(ACCESS_TOKEN, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    controller.abort();

    await expect(loading).resolves.toEqual({
      status: 'cancelled',
      taskLists: [
        {
          status: 'incomplete',
          taskList: FIRST_LIST,
          tasks: [decodedTask({ id: 'kept' })],
          reason: 'cancelled',
        },
        { status: 'pending', taskList: SECOND_LIST },
      ],
    });
  });

  it.each([
    ['the first task-list page', [httpFailure(403)], [], 'forbidden'],
    [
      'a later task-list page',
      [jsonResponse({ items: [FIRST_LIST], nextPageToken: 'next' }), httpFailure(403)],
      [{ status: 'pending', taskList: FIRST_LIST }],
      'forbidden',
    ],
  ] as const)(
    'fails on %s without presenting known lists as complete',
    async (_name, replies, lists, reason) => {
      for (const reply of replies) {
        fetchMock.mockResolvedValueOnce(reply);
      }

      await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
        status: 'failed',
        reason,
        taskLists: lists,
      });
    },
  );

  it('rejects a repeated task-list page token without looping', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST], nextPageToken: 'repeated' }))
      .mockResolvedValueOnce(jsonResponse({ items: [SECOND_LIST], nextPageToken: 'repeated' }));

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-response',
      taskLists: [
        { status: 'pending', taskList: FIRST_LIST },
        { status: 'pending', taskList: SECOND_LIST },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a repeated task page token and continues with the next list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [task({ id: 'first' })], nextPageToken: 'repeated' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [task({ id: 'second' })], nextPageToken: 'repeated' }),
      )
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await loadGoogleTasksCatalog(ACCESS_TOKEN);

    expect(result.status).toBe('partial');
    expect(result.taskLists[0]).toEqual({
      status: 'incomplete',
      taskList: FIRST_LIST,
      tasks: [decodedTask({ id: 'first' }), decodedTask({ id: 'second' })],
      reason: 'invalid-response',
    });
    expect(result.taskLists[1]?.status).toBe('complete');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('treats an invalid due date as an invalid list response', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST] }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [task({ id: 'invalid-due', due: '2026-02-30T00:00:00Z' })] }),
      );

    await expect(loadGoogleTasksCatalog(ACCESS_TOKEN)).resolves.toEqual({
      status: 'partial',
      taskLists: [
        {
          status: 'incomplete',
          taskList: FIRST_LIST,
          tasks: [],
          reason: 'invalid-response',
        },
      ],
    });
  });

  it('reloads only one list without mutating the previous catalog entry', async () => {
    const previous: GoogleTaskListLoad = {
      status: 'complete',
      taskList: FIRST_LIST,
      tasks: [decodedTask({ id: 'old' })],
    };
    const snapshot = structuredClone(previous);
    fetchMock.mockResolvedValue(jsonResponse({ items: [task({ id: 'new' })] }));

    await expect(reloadGoogleTaskList(ACCESS_TOKEN, FIRST_LIST)).resolves.toEqual({
      status: 'complete',
      taskList: FIRST_LIST,
      tasks: [decodedTask({ id: 'new' })],
    });
    expect(previous).toEqual(snapshot);
    expect(requestSummary()).toEqual([['list-1', undefined]]);
  });

  it('never loads two task lists concurrently', async () => {
    let resolveFirstList: ((response: Response) => void) | undefined;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST, SECOND_LIST] }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstList = resolve;
          }),
      )
      .mockResolvedValueOnce(jsonResponse({}));

    const loading = loadGoogleTasksCatalog(ACCESS_TOKEN);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestSummary()).toEqual([
      ['lists', undefined],
      ['list-1', undefined],
    ]);

    resolveFirstList?.(jsonResponse({}));
    await expect(loading).resolves.toMatchObject({ status: 'complete' });
    expect(requestSummary()).toEqual([
      ['lists', undefined],
      ['list-1', undefined],
      ['list-2', undefined],
    ]);
  });

  it('emits immutable progress after list pages, list start, task pages and completion', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST], nextPageToken: 'more-lists' }))
      .mockResolvedValueOnce(jsonResponse({ items: [SECOND_LIST] }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [task({ id: 'first-page' })], nextPageToken: 'more-tasks' }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'second-page' })] }))
      .mockResolvedValueOnce(jsonResponse({}));
    const progress: GoogleTaskListLoad[][] = [];

    const result = await loadGoogleTasksCatalog(ACCESS_TOKEN, undefined, (snapshot) => {
      progress.push(snapshot.taskLists as GoogleTaskListLoad[]);
    });

    expect(result.status).toBe('complete');
    expect(progress.map(progressSummary)).toEqual([
      ['pending:list-1'],
      ['pending:list-1', 'pending:list-2'],
      ['loading:list-1:', 'pending:list-2'],
      ['loading:list-1:first-page', 'pending:list-2'],
      ['loading:list-1:first-page,second-page', 'pending:list-2'],
      ['complete:list-1:first-page,second-page', 'pending:list-2'],
      ['complete:list-1:first-page,second-page', 'loading:list-2:'],
      ['complete:list-1:first-page,second-page', 'loading:list-2:'],
      ['complete:list-1:first-page,second-page', 'complete:list-2:'],
    ]);

    expect(progress[0]).toEqual([{ status: 'pending', taskList: FIRST_LIST }]);
    expect(progress[3]?.[0]).toMatchObject({
      status: 'loading',
      tasks: [decodedTask({ id: 'first-page' })],
    });
  });

  it('reports cancellation once and does not emit after the operation finishes', async () => {
    const controller = new AbortController();
    const progress: GoogleTaskListLoad[][] = [];
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [FIRST_LIST] })).mockImplementationOnce(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('controlled abort', 'AbortError'));
          });
        }),
    );

    const loading = loadGoogleTasksCatalog(ACCESS_TOKEN, controller.signal, (snapshot) => {
      progress.push(snapshot.taskLists as GoogleTaskListLoad[]);
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.abort();

    await expect(loading).resolves.toMatchObject({ status: 'cancelled' });
    expect(progress.map(progressSummary)).toEqual([
      ['pending:list-1'],
      ['loading:list-1:'],
      ['incomplete:list-1:'],
    ]);
    const completedEmissionCount = progress.length;
    await Promise.resolve();
    expect(progress).toHaveLength(completedEmissionCount);
  });

  it('emits isolated progress when reloading one task list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'one' })], nextPageToken: 'next' }))
      .mockResolvedValueOnce(jsonResponse({ items: [task({ id: 'two' })] }));
    const progress: string[][] = [];

    await reloadGoogleTaskList(ACCESS_TOKEN, FIRST_LIST, undefined, (taskList) => {
      progress.push(taskList.tasks.map(({ id }) => id));
    });

    expect(progress).toEqual([[], ['one'], ['one', 'two']]);
  });
});

function progressSummary(taskLists: readonly GoogleTaskListLoad[]): string[] {
  return taskLists.map((taskList) =>
    taskList.status === 'pending'
      ? `pending:${taskList.taskList.id}`
      : `${taskList.status}:${taskList.taskList.id}:${taskList.tasks.map(({ id }) => id).join(',')}`,
  );
}

function task(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'task',
    title: 'Tarefa',
    position: '0001',
    status: 'needsAction',
    ...overrides,
  };
}

function decodedTask(overrides: Partial<GoogleTaskItem> = {}): GoogleTaskItem {
  return {
    id: 'task',
    title: 'Tarefa',
    position: '0001',
    status: 'needsAction',
    deleted: false,
    hidden: false,
    assigned: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpFailure(status: number): Response {
  return new Response(null, { status });
}

function requestSummary(): readonly (readonly [string, string | undefined])[] {
  return fetchMock.mock.calls.map(([input]) => {
    const url = new URL(input as URL);
    const listMatch = /^\/tasks\/v1\/lists\/([^/]+)\/tasks$/.exec(url.pathname);

    return [
      listMatch ? decodeURIComponent(listMatch[1] ?? '') : 'lists',
      url.searchParams.get('pageToken') ?? undefined,
    ];
  });
}
