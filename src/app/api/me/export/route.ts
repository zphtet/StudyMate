import { NextResponse } from 'next/server'
import { getExport } from '@/features/profile/repo'
import { handle } from '@/lib/http'
import { requireUser } from '@/server/auth/guards'

// GET /api/me/export (contracts/route-handlers.md): download of the caller's own data (FR-008).
export function GET() {
  return handle(async () => {
    const data = await getExport(await requireUser())
    const day = data.exportedAt.slice(0, 10)
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="studymate-export-${day}.json"`,
        'Cache-Control': 'private, no-store',
      },
    })
  })
}
