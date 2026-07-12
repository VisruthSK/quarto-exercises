import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  use: {
    browserName: 'chromium',
    viewport: { width: 1100, height: 800 },
    screenshot: 'only-on-failure'
  }
});
