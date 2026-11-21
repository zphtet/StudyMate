import type { Page } from '@playwright/test'

/**
 * e2e runs against `pnpm dev`, whose Next.js dev-tools badge sits in the bottom-left corner and
 * intercepts clicks on controls there (e.g. the lesson editor's delete button). Production builds
 * have no badge, so tests hide it instead of moving the UI. Runtime errors still fail assertions.
 */
export async function hideNextDevOverlay(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.head.append(style)
    })
  })
}
