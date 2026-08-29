const SESSION_STORAGE_LOCK_NAME = 'pacebit:timer-storage';

export async function withSessionStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockManager = globalThis.navigator?.locks;

  if (!lockManager) {
    throw new Error('Session storage coordination is unavailable.');
  }

  return lockManager.request(SESSION_STORAGE_LOCK_NAME, { mode: 'exclusive' }, operation);
}
