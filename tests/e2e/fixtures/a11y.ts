import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Constitution V: no serious or critical axe violations on the current screen. YouTube embeds are
 * left out: inside is YouTube's own player, which the app can't change. (The iframe's title comes
 * from our renderer and is covered by the Markdown tests.)
 */
export async function expectNoSeriousA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .exclude('iframe[src^="https://www.youtube-nocookie.com/"]')
    .analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(serious).toEqual([])
}
