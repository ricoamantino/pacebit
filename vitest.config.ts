import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    clearMocks: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
