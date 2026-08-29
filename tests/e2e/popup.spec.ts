import { expect, test } from './fixtures';

const EXTENSION_ID = 'jkpogflkipedlninnnplenlajoofkkfp';

test('carrega o popup da extensão no Chromium', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);

  await expect(page).toHaveTitle('Pacebit');
  await expect(page.getByRole('heading', { name: 'Pacebit' })).toBeVisible();
  await expect(page.getByText('Acompanhe o tempo dedicado às suas tarefas.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conexão Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarefas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sessão atual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Total de hoje' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar com Google' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
