import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const PORT = process.env.PORT || '3000';
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  globalSetup:    './tests/global-setup',
  globalTeardown: './tests/global-teardown',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
