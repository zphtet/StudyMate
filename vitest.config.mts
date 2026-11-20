import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Unit + component tests (technical spec §13). E2E lives in tests/e2e and runs with Playwright.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
})
