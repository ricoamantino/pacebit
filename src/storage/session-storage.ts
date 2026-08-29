import { storage } from 'wxt/utils/storage';
import type { ActiveSession, CompletedSession } from '../timer/session';
import { decodeActiveSession, decodeSessionHistory, type SessionStorageRead } from './session-data';

export type { SessionStorageRead } from './session-data';

const activeSessionItem = storage.defineItem<unknown>('local:active-session');
const sessionHistoryItem = storage.defineItem<unknown>('local:session-history', {
  fallback: [],
});

export async function readActiveSession(): Promise<SessionStorageRead<ActiveSession | null>> {
  return decodeActiveSession(await activeSessionItem.getValue());
}

export async function readSessionHistory(): Promise<
  SessionStorageRead<readonly CompletedSession[]>
> {
  return decodeSessionHistory(await sessionHistoryItem.getValue());
}
