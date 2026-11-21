// Gives every Playwright run its own id. Workers start after global setup, so they inherit it and
// fixture addresses share one prefix that global teardown can clean up (spec 001 research R5).
export default function globalSetup() {
  process.env.E2E_RUN ??= Date.now().toString(36)
}
