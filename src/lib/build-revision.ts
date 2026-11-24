import { spawnSync } from 'node:child_process'

/**
 * This build's revision (spec 008 research R1, R4): changes the service worker's bytes on every
 * deploy so browsers find the update, and busts the persisted query cache. `SW_REVISION` lets the
 * update test force a new one (T049).
 */
export function buildRevision() {
  return (
    process.env.SW_REVISION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() || 'unversioned')
  )
}
