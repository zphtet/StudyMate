import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Constitution V: no serious or critical axe violations on the current screen. YouTube embeds are
 * left out: inside is YouTube's own player, which the app can't change. (The iframe's title comes
 * from our renderer and is covered by the Markdown tests.)
 */
export async function expectNoSeriousA11yViolations(page: Page) {
  // A sheet or menu still fading in reads as low contrast; let finite animations end first.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const { violations } = await new AxeBuilder({ page })
    .exclude('iframe[src^="https://www.youtube-nocookie.com/"]')
    .analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(serious).toEqual([])
}
