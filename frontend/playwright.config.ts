import { defineConfig } from '@playwright/test';

const origin = 'http://127.0.0.1:3011';
const fixture = 'http://127.0.0.1:4011';
const production = process.env.EXAMFORGE_E2E_PRODUCTION === '1';
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  use: { baseURL: origin, channel: process.env.EXAMFORGE_BROWSER_CHANNEL, viewport: { width: 1440, height: 960 } },
  webServer: [
    { command: 'node ../backend/tests/browser-fixture.ts', url: fixture + '/api/health', timeout: 30000 },
    {
      command: production
        ? 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3011'
        : 'npm run dev -- --hostname 127.0.0.1 --port 3011',
      url: origin + '/login', timeout: 120000,
      env: {
        NEXT_PUBLIC_API_URL: fixture + '/api', NEXT_PUBLIC_SUPABASE_URL: fixture,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'playwright-fixture-key', NEXT_TELEMETRY_DISABLED: '1',
        EXAMFORGE_PLAYWRIGHT: '1',
      },
    },
  ],
});
