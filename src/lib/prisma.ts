import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// Runtime queries use Supabase's transaction pooler (port 6543). Keep the pool small on serverless.
const createClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 3 }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> }

// Reuse one client across hot reloads in dev and across invocations in a warm serverless instance.
export const prisma = globalForPrisma.prisma ?? createClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
