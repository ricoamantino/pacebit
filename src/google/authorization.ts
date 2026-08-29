const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

interface IdentityTokenResult {
  readonly token?: string;
  readonly grantedScopes?: readonly string[];
}

interface ChromeIdentityApi {
  readonly getAuthToken: (details: {
    readonly interactive: boolean;
  }) => Promise<IdentityTokenResult> | undefined;
  readonly removeCachedAuthToken: (details: {
    readonly token: string;
  }) => Promise<void> | undefined;
}

export type GoogleAuthorizationResult =
  | { readonly status: 'authorized'; readonly accessToken: string }
  | { readonly status: 'authorization-required' }
  | { readonly status: 'failed' };

export function getGoogleAuthorization(): Promise<GoogleAuthorizationResult> {
  return acquireGoogleAuthorization(false);
}

export function requestGoogleAuthorization(): Promise<GoogleAuthorizationResult> {
  return acquireGoogleAuthorization(true);
}

export async function renewGoogleAuthorization(
  invalidToken: string,
): Promise<GoogleAuthorizationResult> {
  const identity = getIdentityApi();

  if (!identity || invalidToken.length === 0) {
    return failed();
  }

  try {
    const removal = identity.removeCachedAuthToken({ token: invalidToken });

    if (!removal) {
      return failed();
    }

    await removal;
  } catch {
    return failed();
  }

  return acquireGoogleAuthorization(false);
}

async function acquireGoogleAuthorization(
  interactive: boolean,
): Promise<GoogleAuthorizationResult> {
  const identity = getIdentityApi();

  if (!identity) {
    return failed();
  }

  let result: IdentityTokenResult;

  try {
    const tokenRequest = identity.getAuthToken({ interactive });

    if (!tokenRequest) {
      return failed();
    }

    result = await tokenRequest;
  } catch {
    return interactive ? failed() : authorizationRequired();
  }

  if (!result.token) {
    return interactive ? failed() : authorizationRequired();
  }

  if (result.grantedScopes && !result.grantedScopes.includes(GOOGLE_TASKS_SCOPE)) {
    try {
      const removal = identity.removeCachedAuthToken({ token: result.token });

      if (!removal) {
        return failed();
      }

      await removal;
    } catch {
      return failed();
    }

    return interactive ? failed() : authorizationRequired();
  }

  return { status: 'authorized', accessToken: result.token };
}

function getIdentityApi(): ChromeIdentityApi | null {
  const chromeGlobal = globalThis as typeof globalThis & {
    readonly chrome?: { readonly identity?: ChromeIdentityApi };
  };

  return chromeGlobal.chrome?.identity ?? null;
}

function authorizationRequired(): GoogleAuthorizationResult {
  return { status: 'authorization-required' };
}

function failed(): GoogleAuthorizationResult {
  return { status: 'failed' };
}
