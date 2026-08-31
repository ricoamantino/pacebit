import type { Page } from '@playwright/test';
import { formatDuration } from '../../entrypoints/popup/time-format';
import type { CompletedSession, RunningSession } from '../../src/timer/session';
import { expect, test } from './fixtures';

const EXTENSION_ID = 'jkpogflkipedlninnnplenlajoofkkfp';
const POPUP_URL = `chrome-extension://${EXTENSION_ID}/popup.html`;

interface ExtensionGlobal {
  readonly chrome: {
    readonly storage: {
      readonly local: {
        get(keys: readonly string[]): Promise<Record<string, unknown>>;
        remove(keys: string | readonly string[]): Promise<void>;
        set(items: Record<string, unknown>): Promise<void>;
      };
    };
  };
}

test('pausa, retoma e finaliza uma sessão usando o armazenamento real da extensão', async ({
  context,
  page,
}) => {
  const nowMs = new Date(2026, 7, 30, 10, 0, 10).getTime();
  await page.clock.install({ time: nowMs });
  await page.clock.pauseAt(nowMs);
  const session = createRunningSession(nowMs);
  const existingHistory = createOfflineHistory(nowMs);
  await seedTimerState(page, session, [existingHistory]);

  const total = page.getByRole('region', { name: 'Total de hoje' });
  await expect(page.getByRole('button', { name: 'Conectar com Google' })).toBeVisible();
  await expect(total).toContainText('00:00:07');

  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('button', { name: 'Retomar' })).toBeVisible();
  await expect(total).toContainText('00:00:07');

  await page.clock.fastForward(5_000);
  await expect(total).toContainText('00:00:07');

  await page.getByRole('button', { name: 'Retomar' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await page.clock.fastForward(3_000);
  await expect(total).toContainText('00:00:10');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(page.getByText('Tarefa local controlada')).toBeVisible();
  await expect(total).toContainText('00:00:10');

  await page.getByRole('button', { name: 'Finalizar sessão' }).click();
  await expect(page.getByText('Sessão finalizada e salva no histórico.')).toBeVisible();
  await expect(page.getByText('Nenhuma sessão em andamento.')).toBeVisible();
  await expect(total).toContainText('00:00:10');

  const stored = await readTimerStorage(page);
  expect(stored.activeSession).toBeUndefined();
  expect(stored.history).toHaveLength(2);
  expect(stored.history.filter((completed) => completed.id === session.id)).toHaveLength(1);
  expect(stored.history.find((completed) => completed.id === session.id)).toMatchObject({
    id: session.id,
    task: session.task,
    durationMs: 8_000,
  });

  await page.close();
  const reopenedPage = await context.newPage();
  await reopenedPage.clock.install({ time: nowMs + 8_000 });
  await reopenedPage.clock.pauseAt(nowMs + 8_000);
  await reopenedPage.goto(POPUP_URL);

  await expect(reopenedPage.getByText('Nenhuma sessão em andamento.')).toBeVisible();
  await expect(reopenedPage.getByRole('region', { name: 'Histórico' })).toContainText('2 sessões');
  await expect(reopenedPage.getByRole('region', { name: 'Total de hoje' })).toContainText(
    formatDuration(existingHistory.durationMs + 8_000),
  );
});

test('cancela diretamente sem criar histórico', async ({ page }) => {
  const session = createRunningSession();
  await seedTimerState(page, session);

  await page.getByRole('button', { name: 'Cancelar sessão' }).click();

  await expect(
    page.getByText('Sessão cancelada. Nenhum tempo foi adicionado ao histórico.'),
  ).toBeVisible();
  const stored = await readTimerStorage(page);
  expect(stored.activeSession).toBeUndefined();
  expect(stored.history).toEqual([]);
});

test('reflete em outra página uma transição persistida sem recarregar', async ({
  context,
  page,
}) => {
  const session = createRunningSession();
  await seedTimerState(page, session);
  const secondPage = await context.newPage();
  await secondPage.goto(POPUP_URL);

  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(secondPage.getByRole('button', { name: 'Pausar' })).toBeVisible();

  await page.getByRole('button', { name: 'Pausar' }).click();

  await expect(secondPage.getByRole('button', { name: 'Retomar' })).toBeVisible();
  await expect(secondPage.getByText(/Trabalho · Pausada/)).toBeVisible();
});

test('apresenta histórico persistido em ordem e lotes de 20', async ({ page }) => {
  const history = Array.from({ length: 21 }, (_, index) => createCompletedSession(index));
  await seedHistory(page, history);

  const historyRegion = page.getByRole('region', { name: 'Histórico' });
  const sessions = historyRegion.getByRole('listitem');
  await expect(sessions).toHaveCount(20);
  await expect(sessions.first()).toContainText('Sessão 20');
  await expect(sessions.first()).toContainText('Lista local');
  await expect(sessions.first()).toContainText('Duração · 00:00:05');
  await expect(historyRegion.getByText('Sessão 0')).toHaveCount(0);

  await historyRegion.getByRole('button', { name: 'Mostrar mais 20 sessões' }).click();

  await expect(sessions).toHaveCount(21);
  await expect(sessions.last()).toContainText('Sessão 0');
  await expect(historyRegion.getByRole('button', { name: 'Mostrar mais 20 sessões' })).toHaveCount(
    0,
  );
});

function createRunningSession(nowMs: number = Date.now()): RunningSession {
  const startedAtMs = nowMs - 5_000;

  return {
    id: 'e2e-session',
    state: 'running',
    task: { id: 'e2e-task', title: 'Tarefa local controlada' },
    taskList: { id: 'e2e-list', title: 'Trabalho' },
    startedAtMs,
    periods: [],
    runningSinceMs: startedAtMs,
  };
}

function createOfflineHistory(nowMs: number): CompletedSession {
  const startedAtMs = nowMs - 9_000;
  const endedAtMs = nowMs - 7_000;

  return {
    id: 'e2e-existing-history',
    task: { id: 'e2e-existing-task', title: 'Histórico anterior' },
    taskList: { id: 'e2e-list', title: 'Trabalho' },
    startedAtMs,
    endedAtMs,
    periods: [{ startedAtMs, endedAtMs }],
    durationMs: 2_000,
  };
}

function createCompletedSession(index: number): CompletedSession {
  const startedAtMs = new Date(2026, 7, 29, 10, index).getTime();
  const endedAtMs = startedAtMs + 5_000;

  return {
    id: `e2e-history-${index.toString().padStart(2, '0')}`,
    task: { id: `e2e-task-${index}`, title: `Sessão ${index}` },
    taskList: { id: 'e2e-list', title: 'Lista local' },
    startedAtMs,
    endedAtMs,
    periods: [{ startedAtMs, endedAtMs }],
    durationMs: 5_000,
  };
}

async function seedTimerState(
  page: Page,
  session: RunningSession,
  history: readonly CompletedSession[] = [],
) {
  await page.goto(POPUP_URL);
  await page.evaluate(
    async ({ activeSession, completedSessions }) => {
      const extension = globalThis as typeof globalThis & ExtensionGlobal;
      await extension.chrome.storage.local.set({
        'active-session': activeSession,
        'session-history': completedSessions,
      });
    },
    { activeSession: session, completedSessions: history },
  );
  await page.reload();
}

async function seedHistory(page: Page, history: readonly CompletedSession[]) {
  await page.goto(POPUP_URL);
  await page.evaluate(async (completedSessions) => {
    const extension = globalThis as typeof globalThis & ExtensionGlobal;
    await extension.chrome.storage.local.remove('active-session');
    await extension.chrome.storage.local.set({ 'session-history': completedSessions });
  }, history);
  await page.reload();
}

async function readTimerStorage(page: Page) {
  return page.evaluate(async () => {
    const extension = globalThis as typeof globalThis & ExtensionGlobal;
    const stored = await extension.chrome.storage.local.get(['active-session', 'session-history']);

    return {
      activeSession: stored['active-session'],
      history: stored['session-history'] as CompletedSession[],
    };
  });
}
