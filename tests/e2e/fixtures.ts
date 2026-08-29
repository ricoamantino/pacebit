import path from 'node:path';
import { type BrowserContext, test as base, chromium } from '@playwright/test';

export const test = base.extend<{ context: BrowserContext }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture arguments to use object destructuring.
  context: async ({}, use) => {
    const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3-test');
    const context = await chromium.launchPersistentContext('', {
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      channel: 'chromium',
      headless: true,
    });

    await use(context);
    await context.close();
  },
});

export const expect = test.expect;
