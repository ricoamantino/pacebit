import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getGoogleAuthorization,
  renewGoogleAuthorization,
  requestGoogleAuthorization,
} from '../../src/google/authorization';

const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google authorization', () => {
  it.each([
    ['without grantedScopes', { token: 'access-token' }],
    ['with the Tasks scope', { token: 'access-token', grantedScopes: [GOOGLE_TASKS_SCOPE] }],
  ])('gets a cached token non-interactively %s', async (_description, tokenResult) => {
    const identity = installIdentity({ getAuthTokenResult: tokenResult });

    await expect(getGoogleAuthorization()).resolves.toEqual({
      status: 'authorized',
      accessToken: 'access-token',
    });
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: false });
  });

  it('reports that interaction is required without exposing a silent error', async () => {
    const identity = installIdentity({ getAuthTokenError: new Error('internal OAuth details') });

    await expect(getGoogleAuthorization()).resolves.toEqual({
      status: 'authorization-required',
    });
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: false });
  });

  it('uses interactive authorization only through the explicit request function', async () => {
    const identity = installIdentity({ getAuthTokenResult: { token: 'interactive-token' } });

    await expect(requestGoogleAuthorization()).resolves.toEqual({
      status: 'authorized',
      accessToken: 'interactive-token',
    });
    expect(identity.getAuthToken).toHaveBeenCalledOnce();
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: true });
  });

  it('sanitizes a rejected interactive authorization', async () => {
    installIdentity({ getAuthTokenError: new Error('the user rejected access') });

    await expect(requestGoogleAuthorization()).resolves.toEqual({ status: 'failed' });
  });

  it.each([
    ['silent', getGoogleAuthorization, { status: 'authorization-required' }],
    ['interactive', requestGoogleAuthorization, { status: 'failed' }],
  ])('handles a tokenless %s response', async (_description, authorize, expected) => {
    installIdentity({ getAuthTokenResult: {} });

    await expect(authorize()).resolves.toEqual(expected);
  });

  it.each([
    ['silent', getGoogleAuthorization, { status: 'authorization-required' }],
    ['interactive', requestGoogleAuthorization, { status: 'failed' }],
  ])(
    'removes a token without the Tasks scope after a %s request',
    async (_description, authorize, expected) => {
      const identity = installIdentity({
        getAuthTokenResult: {
          token: 'insufficient-token',
          grantedScopes: ['https://www.googleapis.com/auth/tasks.readonly'],
        },
      });

      await expect(authorize()).resolves.toEqual(expected);
      expect(identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'insufficient-token' });
    },
  );

  it('fails if an insufficient token cannot be removed', async () => {
    const identity = installIdentity({
      getAuthTokenResult: { token: 'insufficient-token', grantedScopes: [] },
      removeCachedAuthTokenError: new Error('internal removal details'),
    });

    await expect(getGoogleAuthorization()).resolves.toEqual({ status: 'failed' });
    expect(identity.removeCachedAuthToken).toHaveBeenCalledOnce();
  });

  it('removes an invalid token before renewing it silently', async () => {
    const removal = Promise.withResolvers<void>();
    const calls: string[] = [];
    const identity = installIdentity({ getAuthTokenResult: { token: 'renewed-token' } });
    identity.removeCachedAuthToken.mockImplementation(async () => {
      calls.push('remove-started');
      await removal.promise;
      calls.push('remove-finished');
    });
    identity.getAuthToken.mockImplementation(async () => {
      calls.push('get-token');
      return { token: 'renewed-token' };
    });

    const renewal = renewGoogleAuthorization('invalid-token');
    await vi.waitFor(() => expect(calls).toEqual(['remove-started']));
    expect(identity.getAuthToken).not.toHaveBeenCalled();
    removal.resolve();

    await expect(renewal).resolves.toEqual({
      status: 'authorized',
      accessToken: 'renewed-token',
    });
    expect(calls).toEqual(['remove-started', 'remove-finished', 'get-token']);
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: false });
  });

  it('does not request another token if invalidation fails', async () => {
    const identity = installIdentity({
      removeCachedAuthTokenError: new Error('controlled invalidation failure'),
    });

    await expect(renewGoogleAuthorization('invalid-token')).resolves.toEqual({
      status: 'failed',
    });
    expect(identity.getAuthToken).not.toHaveBeenCalled();
  });

  it('rejects an empty invalid token without calling the Identity API', async () => {
    const identity = installIdentity();

    await expect(renewGoogleAuthorization('')).resolves.toEqual({ status: 'failed' });
    expect(identity.removeCachedAuthToken).not.toHaveBeenCalled();
    expect(identity.getAuthToken).not.toHaveBeenCalled();
  });

  it('fails safely when the Identity API is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);

    await expect(getGoogleAuthorization()).resolves.toEqual({ status: 'failed' });
    await expect(requestGoogleAuthorization()).resolves.toEqual({ status: 'failed' });
    await expect(renewGoogleAuthorization('invalid-token')).resolves.toEqual({ status: 'failed' });
  });

  it('does not persist, log or call a remote endpoint', async () => {
    fakeBrowser.reset();
    installIdentity({ getAuthTokenResult: { token: 'access-token' } });
    const storageSet = vi.spyOn(fakeBrowser.storage.local, 'set');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, 'fetch');

    await getGoogleAuthorization();

    expect(storageSet).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

interface IdentityOptions {
  readonly getAuthTokenResult?: {
    readonly token?: string;
    readonly grantedScopes?: readonly string[];
  };
  readonly getAuthTokenError?: Error;
  readonly removeCachedAuthTokenError?: Error;
}

function installIdentity(options: IdentityOptions = {}) {
  const getAuthToken = options.getAuthTokenError
    ? vi.fn().mockRejectedValue(options.getAuthTokenError)
    : vi.fn().mockResolvedValue(options.getAuthTokenResult ?? {});
  const removeCachedAuthToken = options.removeCachedAuthTokenError
    ? vi.fn().mockRejectedValue(options.removeCachedAuthTokenError)
    : vi.fn().mockResolvedValue(undefined);
  const identity = { getAuthToken, removeCachedAuthToken };

  vi.stubGlobal('chrome', { identity });

  return identity;
}
