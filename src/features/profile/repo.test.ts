// @vitest-environment node
// Spec 007 against the dev database (T007): saving appearance and reading it back
// (contracts/server-actions.md › saveAppearance, contracts/route-handlers.md › GET /api/me;
// data-model.md Profile.color_mode, Profile.theme_id, Profile.font_id, Profile.font_scale). The
// guard runs in the action; here the function takes the caller's id. Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getMe, saveAppearance } from './repo'

vi.setConfig({ testTimeout: 60_000 })

const run = Date.now()
const may = { id: randomUUID() }
const ken = { id: randomUUID() }
const users = [may.id, ken.id]

beforeAll(async () => {
  for (const [id, name] of [
    [may.id, 'May'],
    [ken.id, 'Ken'],
  ]) {
    const meta = JSON.stringify({ role: 'student', display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${id}::uuid, ${`profile-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  }
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const row = (id: string) =>
  prisma.profile.findUniqueOrThrow({
    where: { id },
    select: { colorMode: true, themeId: true, fontId: true, fontScale: true },
  })

describe('saveAppearance', () => {
  test('changes only the field given and returns all four', async () => {
    const saved = await saveAppearance(may.id, { themeId: 'sakura' })
    expect(saved).toEqual({
      colorMode: 'system',
      themeId: 'sakura',
      fontId: 'inter',
      textSize: 'default',
    })
    const after = await row(may.id)
    expect(after.themeId).toBe('sakura')
    expect(after.fontId).toBe('inter')
  })

  test('Large text is stored as font_scale 1.13 (data-model.md Profile.font_scale)', async () => {
    await saveAppearance(may.id, { textSize: 'large', colorMode: 'dark', fontId: 'nunito' })
    const after = await row(may.id)
    expect(after.fontScale.toString()).toBe('1.13')
    expect(after.colorMode).toBe('dark')
    expect(after.fontId).toBe('nunito')
  })

  test("another user's row is untouched", async () => {
    await saveAppearance(may.id, { themeId: 'mocha' })
    expect(await row(ken.id)).toMatchObject({ themeId: 'indigo', fontId: 'inter' })
  })
})

describe('getMe', () => {
  test('returns the theme, font and text size', async () => {
    await saveAppearance(may.id, {
      colorMode: 'light',
      themeId: 'forest',
      fontId: 'atkinson',
      textSize: 'small',
    })
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: may.id } })
    const me = await getMe({ ...profile, email: 'may@example.test', role: 'student' })
    expect(me).toMatchObject({
      colorMode: 'light',
      themeId: 'forest',
      fontId: 'atkinson',
      textSize: 'small',
    })
  })
})
