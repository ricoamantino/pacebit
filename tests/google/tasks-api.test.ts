import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { listGoogleTaskListsPage } from '../../src/google/task-lists';
import { completeGoogleTask, listGoogleTasksPage } from '../../src/google/tasks';

const ACCESS_TOKEN = 'controlled-access-token';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Google Tasks REST API', () => {
  it('requests and decodes one task-list page with partial fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        nextPageToken: 'next/list page',
        items: [{ id: 'list-1', title: 'Trabalho', etag: 'discarded' }],
        kind: 'discarded',
      }),
    );

    await expect(listGoogleTaskListsPage(ACCESS_TOKEN, 'current/list page')).resolves.toEqual({
      status: 'success',
      value: {
        items: [{ id: 'list-1', title: 'Trabalho' }],
        nextPageToken: 'next/list page',
      },
    });

    const { url, init } = recordedRequest();
    expect(url.origin).toBe('https://tasks.googleapis.com');
    expect(url.pathname).toBe('/tasks/v1/users/@me/lists');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      maxResults: '1000',
      fields: 'nextPageToken,items(id,title)',
      pageToken: 'current/list page',
    });
    expect(init).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });
    expect(init.body).toBeUndefined();
  });

  it('treats an omitted task-list collection as an empty page', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await expect(listGoogleTaskListsPage(ACCESS_TOKEN)).resolves.toEqual({
      status: 'success',
      value: { items: [] },
    });

    expect(recordedRequest().url.searchParams.has('pageToken')).toBe(false);
  });

  it.each([
    ['a non-object page', []],
    ['a non-array items field', { items: {} }],
    ['a task list without an ID', { items: [{ title: 'Lista' }] }],
    ['a task list without a title', { items: [{ id: 'list-1' }] }],
    ['an empty next-page token', { items: [], nextPageToken: '' }],
  ])('rejects %s', async (_description, payload) => {
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(listGoogleTaskListsPage(ACCESS_TOKEN)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-response',
    });
  });

  it('requests and decodes one task page with explicit filters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        nextPageToken: 'next task page',
        items: [
          {
            id: 'task-1',
            title: 'Preparar relatório',
            parent: 'parent-1',
            position: '0001',
            status: 'needsAction',
            due: '2026-08-30T00:00:00.000Z',
            deleted: false,
            hidden: false,
            assignmentInfo: { surfaceType: 'DOCUMENT', linkToTask: 'discarded' },
            notes: 'discarded',
          },
        ],
      }),
    );

    await expect(
      listGoogleTasksPage(ACCESS_TOKEN, 'list/with spaces', 'current task page'),
    ).resolves.toEqual({
      status: 'success',
      value: {
        items: [
          {
            id: 'task-1',
            title: 'Preparar relatório',
            parentId: 'parent-1',
            position: '0001',
            status: 'needsAction',
            due: '2026-08-30T00:00:00.000Z',
            deleted: false,
            hidden: false,
            assigned: true,
          },
        ],
        nextPageToken: 'next task page',
      },
    });

    const { url, init } = recordedRequest();
    expect(url.pathname).toBe('/tasks/v1/lists/list%2Fwith%20spaces/tasks');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      maxResults: '100',
      showCompleted: 'false',
      showDeleted: 'false',
      showHidden: 'false',
      showAssigned: 'false',
      fields:
        'nextPageToken,items(id,title,parent,position,status,due,deleted,hidden,assignmentInfo(surfaceType))',
      pageToken: 'current task page',
    });
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    });
  });

  it('defaults omitted output flags and optional task fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [{ id: 'task-1', title: '', position: '0001', status: 'needsAction' }],
      }),
    );

    await expect(listGoogleTasksPage(ACCESS_TOKEN, 'list-1')).resolves.toEqual({
      status: 'success',
      value: {
        items: [
          {
            id: 'task-1',
            title: '',
            position: '0001',
            status: 'needsAction',
            deleted: false,
            hidden: false,
            assigned: false,
          },
        ],
      },
    });
  });

  it.each([
    ['an unknown task status', { id: 'task', title: 'T', position: '1', status: 'unknown' }],
    ['a missing position', { id: 'task', title: 'T', status: 'needsAction' }],
    [
      'a non-boolean hidden flag',
      { id: 'task', title: 'T', position: '1', status: 'needsAction', hidden: 'false' },
    ],
    [
      'an invalid assignment',
      { id: 'task', title: 'T', position: '1', status: 'needsAction', assignmentInfo: {} },
    ],
  ])('rejects %s', async (_description, task) => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [task] }));

    await expect(listGoogleTasksPage(ACCESS_TOKEN, 'list-1')).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-response',
    });
  });

  it('patches only the completion status and decodes the minimal response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'task/id',
        status: 'completed',
        completed: '2026-08-29T05:00:00.000Z',
        title: 'discarded',
      }),
    );

    await expect(completeGoogleTask(ACCESS_TOKEN, 'list/id', 'task/id')).resolves.toEqual({
      status: 'success',
      value: {
        id: 'task/id',
        status: 'completed',
        completed: '2026-08-29T05:00:00.000Z',
      },
    });

    const { url, init } = recordedRequest();
    expect(url.pathname).toBe('/tasks/v1/lists/list%2Fid/tasks/task%2Fid');
    expect(Object.fromEntries(url.searchParams)).toEqual({ fields: 'id,status,completed' });
    expect(init).toEqual({
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(init.body).not.toContain('title');
    expect(init.body).not.toContain('notes');
    expect(init.body).not.toContain('due');
    expect(init.body).not.toContain('position');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('completed');
  });

  it.each([
    ['a missing completion ID', { status: 'completed' }],
    ['a non-completed status', { id: 'task-1', status: 'needsAction' }],
    ['an invalid completion date', { id: 'task-1', status: 'completed', completed: 1 }],
  ])('rejects %s', async (_description, payload) => {
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(completeGoogleTask(ACCESS_TOKEN, 'list-1', 'task-1')).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-response',
    });
  });

  it.each([
    ['an empty access token', () => listGoogleTaskListsPage('')],
    ['a blank page token', () => listGoogleTaskListsPage(ACCESS_TOKEN, ' ')],
    ['an empty task-list ID', () => listGoogleTasksPage(ACCESS_TOKEN, '')],
    ['an empty task ID', () => completeGoogleTask(ACCESS_TOKEN, 'list-1', '')],
  ])('rejects %s without making a request', async (_description, request) => {
    await expect(request()).resolves.toEqual({ status: 'failed', reason: 'invalid-request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, { status: 'authorization-required' }],
    [403, { status: 'failed', reason: 'forbidden' }],
    [404, { status: 'failed', reason: 'not-found' }],
    [429, { status: 'failed', reason: 'rate-limited' }],
    [400, { status: 'failed', reason: 'request-failed' }],
    [500, { status: 'failed', reason: 'unavailable' }],
    [503, { status: 'failed', reason: 'unavailable' }],
  ])('sanitizes HTTP %i without reading its payload', async (status, expected) => {
    const json = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, status, json });

    await expect(listGoogleTaskListsPage(ACCESS_TOKEN)).resolves.toEqual(expected);
    expect(json).not.toHaveBeenCalled();
  });

  it('sanitizes a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('controlled internal network details'));

    await expect(listGoogleTaskListsPage(ACCESS_TOKEN)).resolves.toEqual({
      status: 'failed',
      reason: 'unavailable',
    });
  });

  it('rejects an invalid successful JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('controlled invalid JSON')),
    });

    await expect(listGoogleTaskListsPage(ACCESS_TOKEN)).resolves.toEqual({
      status: 'failed',
      reason: 'invalid-response',
    });
  });

  it('cancels before sending a request', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      listGoogleTaskListsPage(ACCESS_TOKEN, undefined, controller.signal),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels an in-flight request', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('controlled abort details', 'AbortError'));
          });
        }),
    );

    const request = listGoogleTasksPage(ACCESS_TOKEN, 'list-1', undefined, controller.signal);
    controller.abort();

    await expect(request).resolves.toEqual({ status: 'cancelled' });
  });

  it('does not persist, log or make an uncontrolled request', async () => {
    fakeBrowser.reset();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    const storageSet = vi.spyOn(fakeBrowser.storage.local, 'set');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await listGoogleTaskListsPage(ACCESS_TOKEN);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storageSet).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function recordedRequest(): { readonly url: URL; readonly init: RequestInit } {
  const call = fetchMock.mock.calls[0];

  if (!call) {
    throw new Error('Expected a controlled fetch call.');
  }

  const [input, init] = call as [URL, RequestInit];

  return { url: new URL(input), init };
}
