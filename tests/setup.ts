import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const lockQueues = new Map<string, Promise<void>>();

const testLockManager = {
  async request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    optionalCallback?: LockGrantedCallback<T>,
  ): Promise<T> {
    const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionalCallback;

    if (!callback || options?.ifAvailable || options?.steal || options?.signal) {
      throw new Error('The test lock manager only supports queued exclusive locks.');
    }

    const previous = lockQueues.get(name) ?? Promise.resolve();
    const released = Promise.withResolvers<void>();
    const queued = previous.catch(() => undefined).then(() => released.promise);
    lockQueues.set(name, queued);

    await previous.catch(() => undefined);

    try {
      return await callback({ name, mode: options?.mode ?? 'exclusive' });
    } finally {
      released.resolve();

      if (lockQueues.get(name) === queued) {
        lockQueues.delete(name);
      }
    }
  },
  async query(): Promise<LockManagerSnapshot> {
    return { held: [], pending: [] };
  },
} as LockManager;

Object.defineProperty(globalThis.navigator, 'locks', {
  configurable: true,
  get: () => testLockManager,
});

afterEach(() => {
  cleanup();
});
