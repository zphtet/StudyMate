import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Constitution V: no serious or critical axe violations on the current screen. */
export async function expectNoSeriousA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(serious).toEqual([])
}
