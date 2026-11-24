// Local stand-in for the notification cron (spec 006 research R2; quickstart.md §6). In production
// pg_cron calls POST /api/cron/dispatch every 5 minutes, but the hosted dev project can't reach
// localhost, so nothing sends scheduled messages or rule reminders while you run `pnpm dev`.
//   pnpm dispatch:watch                              # every 60 s against http://localhost:3000
//   pnpm dispatch:watch http://localhost:3100        # another local server
// Sends real pushes and emails for everything due in the dev database. Ctrl+C to stop.
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'], quiet: true })

const INTERVAL_MS = 60_000
const base = process.argv[2] ?? 'http://localhost:3000'
const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET is not set (see .env.example).')
  process.exit(1)
}

const time = () => new Date().toLocaleTimeString([], { hour12: false })

/** One dispatcher run; prints its counts only when it did something. */
async function dispatchOnce() {
  try {
    const response = await fetch(`${base}/api/cron/dispatch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      console.error(`${time()} HTTP ${response.status}`, body?.error?.code ?? '')
      return
    }
    const isQuiet = Object.values(body).every((count) => count === 0)
    console.log(`${time()} ${isQuiet ? 'nothing due' : JSON.stringify(body)}`)
  } catch (error) {
    console.error(`${time()} can't reach ${base} (is the app running?)`, error.cause?.code ?? '')
  }
}

console.log(`Dispatching every ${INTERVAL_MS / 1000} s to ${base}. Ctrl+C to stop.`)
await dispatchOnce()
setInterval(dispatchOnce, INTERVAL_MS)
