import type { Page } from '@playwright/test';
import type { RunningSession } from '../../src/timer/session';
import { expect, test } from './fixtures';

const EXTENSION_ID = 'jkpogflkipedlninnnplenlajoofkkfp';
const POPUP_URL = `chrome-extension://${EXTENSION_ID}/popup.html`;

interface ExtensionGlobal {
  readonly chrome: {
    readonly storage: {
      readonly local: {
        get(keys: readonly string[]): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
      };
    };
  };
}

test('pausa, retoma e finaliza uma sessão usando o armazenamento real da extensão', async ({
  page,
}) => {
  const session = createRunningSession();
  await seedTimerState(page, session);

  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('button', { name: 'Retomar' })).toBeVisible();

  await page.getByRole('button', { name: 'Retomar' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();

  await page.getByRole('button', { name: 'Finalizar sessão' }).click();
  await expect(page.getByText('Sessão finalizada e salva no histórico.')).toBeVisible();
  await expect(page.getByText('Nenhuma sessão em andamento.')).toBeVisible();

  const stored = await readTimerStorage(page);
  expect(stored.activeSession).toBeUndefined();
  expect(stored.history).toHaveLength(1);
  expect(stored.history[0]).toMatchObject({ id: session.id, task: session.task });
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

function createRunningSession(): RunningSession {
  const startedAtMs = Date.now() - 5_000;

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

async function seedTimerState(page: Page, session: RunningSession) {
  await page.goto(POPUP_URL);
  await page.evaluate(async (activeSession) => {
    const extension = globalThis as typeof globalThis & ExtensionGlobal;
    await extension.chrome.storage.local.set({
      'active-session': activeSession,
      'session-history': [],
    });
  }, session);
  await page.reload();
}

async function readTimerStorage(page: Page) {
  return page.evaluate(async () => {
    const extension = globalThis as typeof globalThis & ExtensionGlobal;
    const stored = await extension.chrome.storage.local.get(['active-session', 'session-history']);

    return {
      activeSession: stored['active-session'],
      history: stored['session-history'] as unknown[],
    };
  });
}
