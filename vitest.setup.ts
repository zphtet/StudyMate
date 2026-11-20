import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { config } from 'dotenv'
import { afterEach } from 'vitest'

// Guard and repo tests talk to the dev database; load the same env files as the Prisma CLI.
config({ path: ['.env.local', '.env'], quiet: true })

afterEach(() => {
  cleanup()
})
