// Prisma 7 config — the CLI no longer reads .env automatically.
// Secrets live in .env.local (CLAUDE.md); .env is a fallback. The first file wins.
import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

config({ path: ['.env.local', '.env'], quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations need a direct / session-mode connection (port 5432), not the transaction pooler.
    // Read without env() so `prisma generate` (postinstall) works where DIRECT_URL isn't set,
    // e.g. on Vercel or a fresh clone. migrate/db commands still fail clearly without it.
    url: process.env.DIRECT_URL,
  },
})
