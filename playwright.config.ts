import { defineConfig, devices } from '@playwright/test';

const PORTA = 4174;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-claro', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'desktop-escuro', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'mobile-claro', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
    { name: 'mobile-escuro', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  ],
  webServer: {
    command: `npm run fixtures && npm run build && npx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
