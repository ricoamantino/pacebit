const GOOGLE_TASKS_API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

export type GoogleTasksFailureReason =
  | 'invalid-request'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'unavailable'
  | 'invalid-response'
  | 'request-failed';

export type GoogleTasksApiResult<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'authorization-required' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly reason: GoogleTasksFailureReason };

interface GoogleTasksRequest {
  readonly accessToken: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly method?: 'GET' | 'PATCH';
  readonly body?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export async function requestGoogleTasks<T>(
  request: GoogleTasksRequest,
  decode: (value: unknown) => T | null,
): Promise<GoogleTasksApiResult<T>> {
  if (!isNonEmptyValue(request.accessToken) || !request.path.startsWith('/')) {
    return failed('invalid-request');
  }

  if (request.signal?.aborted) {
    return { status: 'cancelled' };
  }

  const url = new URL(`${GOOGLE_TASKS_API_BASE_URL}${request.path}`);

  for (const [name, value] of Object.entries(request.query)) {
    url.searchParams.set(name, value);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${request.accessToken}`,
  };

  if (request.body) {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers,
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  };

  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    return isAbort(error, request.signal) ? { status: 'cancelled' } : failed('unavailable');
  }

  if (!response.ok) {
    return mapHttpFailure(response.status);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    return isAbort(error, request.signal) ? { status: 'cancelled' } : failed('invalid-response');
  }

  const value = decode(payload);

  return value === null ? failed('invalid-response') : { status: 'success', value };
}

export function invalidGoogleTasksRequest<T>(): GoogleTasksApiResult<T> {
  return failed('invalid-request');
}

export function isNonEmptyValue(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function mapHttpFailure(status: number): GoogleTasksApiResult<never> {
  switch (status) {
    case 401:
      return { status: 'authorization-required' };
    case 403:
      return failed('forbidden');
    case 404:
      return failed('not-found');
    case 429:
      return failed('rate-limited');
    default:
      return failed(status >= 500 ? 'unavailable' : 'request-failed');
  }
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) {
    return true;
  }

  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

function failed(reason: GoogleTasksFailureReason): GoogleTasksApiResult<never> {
  return { status: 'failed', reason };
}
