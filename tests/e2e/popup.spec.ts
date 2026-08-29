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
  await expect(page.getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Sessão atual' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Conexão Google' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tarefas' })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('region', { name: 'Total de hoje' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Histórico' })).toBeVisible();
  expect(
    await page
      .locator('main > section[aria-labelledby="session-overview-heading"]')
      .evaluate((session) => session.nextElementSibling?.classList.contains('google-regions')),
  ).toBe(true);

  const connect = page.getByRole('button', { name: 'Conectar com Google' });
  await page.keyboard.press('Tab');
  await expect(connect).toBeFocused();
  await expect(connect).toHaveAccessibleDescription(
    /Conecte sua conta para acessar o Google Tasks.*O acesso é usado somente para ler tarefas/,
  );
  expect(
    await connect.evaluate((button) => {
      const style = getComputedStyle(button);

      return {
        color: style.outlineColor,
        offset: style.outlineOffset,
        style: style.outlineStyle,
        width: style.outlineWidth,
      };
    }),
  ).toEqual({ color: 'rgb(29, 78, 216)', offset: '2px', style: 'solid', width: '3px' });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
