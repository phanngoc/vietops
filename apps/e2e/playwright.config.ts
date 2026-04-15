import { defineConfig } from '@playwright/test'

const BASE_URL = 'http://localhost:3099'

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // shared test DB — run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },

  // Start the API server before tests; reuse if already running locally
  webServer: {
    command: 'node --import tsx/esm server.ts',
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
