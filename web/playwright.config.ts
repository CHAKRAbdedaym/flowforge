import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5699);
// PW_CHANNEL=chrome uses the Google Chrome already installed on the machine (no browser download needed).
const channel = process.env.PW_CHANNEL || undefined;

// Runs against the BUILT app (same code path as `npm start`) with a fresh throw-away data directory.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node ../scripts/e2e-server.mjs',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
});
