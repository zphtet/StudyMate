'use client'

import { useRouter } from 'next/navigation'
import { useRealtimeInvalidate } from '@/lib/realtime'

// FR-015: when the student's link changes while the app is open (their admin removed them), the
// student layout checks again: router.refresh() re-runs its active-link check, which sends an
// unlinked student to /join. The event is only a signal; the server decides (research R7).
export function LinkWatcher({ studentId }: { studentId: string }) {
  const router = useRouter()
  useRealtimeInvalidate({
    table: 'student_links',
    filter: `student_id=eq.${studentId}`,
    queryKeys: [],
    onChange: () => router.refresh(),
  })
  return null
}
