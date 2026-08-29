import { expect, test } from './fixtures';

const EXTENSION_ID = 'jkpogflkipedlninnnplenlajoofkkfp';
const POPUP_URL = `chrome-extension://${EXTENSION_ID}/popup.html`;

test('serializa duas páginas da extensão com o mesmo Web Lock', async ({ context, page }) => {
  const secondPage = await context.newPage();
  await Promise.all([page.goto(POPUP_URL), secondPage.goto(POPUP_URL)]);

  await page.evaluate(() => {
    localStorage.removeItem('pacebit-lock-holder');
    localStorage.removeItem('pacebit-lock-release');
    localStorage.removeItem('pacebit-lock-second');
  });

  const firstRequest = page.evaluate(() =>
    navigator.locks.request('pacebit:e2e-coordination', async () => {
      localStorage.setItem('pacebit-lock-holder', 'first');

      while (localStorage.getItem('pacebit-lock-release') !== 'true') {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }),
  );

  await expect
    .poll(() => secondPage.evaluate(() => localStorage.getItem('pacebit-lock-holder')))
    .toBe('first');

  const secondRequest = secondPage.evaluate(() =>
    navigator.locks.request('pacebit:e2e-coordination', () => {
      localStorage.setItem('pacebit-lock-second', 'acquired');
    }),
  );

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const snapshot = await navigator.locks.query();
        return snapshot.pending?.some((lock) => lock.name === 'pacebit:e2e-coordination');
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('pacebit-lock-second'))).toBeNull();

  await page.evaluate(() => localStorage.setItem('pacebit-lock-release', 'true'));
  await Promise.all([firstRequest, secondRequest]);

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pacebit-lock-second')))
    .toBe('acquired');
});
