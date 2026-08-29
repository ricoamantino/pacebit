import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
  testDir: './tests/e2e',
  use: {
    trace: 'retain-on-failure',
  },
  workers: 1,
});
