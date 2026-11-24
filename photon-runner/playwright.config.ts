import { defineConfig, devices } from '@playwright/test';

// The tests start their own API (in-memory database) and client on spare
// ports, so they never touch the dev database or a running `npm run dev`.
const API_PORT = 8797;
const CLIENT_PORT = 3197;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: [
    {
      command: 'npx tsx src/server/serverIndex.ts',
      env: { PORT: String(API_PORT), DB_PATH: ':memory:' },
      url: `http://localhost:${API_PORT}/api/whoami`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${CLIENT_PORT} --strictPort`,
      env: { API_PORT: String(API_PORT) },
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
