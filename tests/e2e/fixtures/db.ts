import pg from 'pg'
import './supabase-admin' // loads .env.local / .env

// Direct database access for e2e fixtures. Plain `pg`, not Prisma: Playwright compiles tests as
// CommonJS and the generated Prisma 7 client is ESM (import.meta), and src/lib/prisma is server-only.
// Seeds rows that other features own (links from 001's UI, assignments from 003, progress from 004).

let pool: pg.Pool | undefined

const getPool = () =>
  (pool ??= new pg.Pool({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    max: 2,
  }))

export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await getPool().query<T>(text, params)).rows
}

export async function closeDb() {
  await pool?.end()
  pool = undefined
}
