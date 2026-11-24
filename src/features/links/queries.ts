import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { InvitePreview, JoinRequest } from './types'

// Reads for joining an admin (contracts/route-handlers.md). Link changes invalidate ['me'] and
// ['admin', 'students'] (contracts/server-actions.md › Query invalidation), which covers these.

export const linkKeys = {
  preview: (code: string) => ['invites', 'preview', code] as const,
  requests: ['admin', 'students', 'requests'] as const,
}

export const invitePreviewQuery = (code: string) =>
  queryOptions({
    queryKey: linkKeys.preview(code),
    queryFn: () => api<InvitePreview>(`/api/invites/preview?code=${encodeURIComponent(code)}`),
    // A wrong code is an answer, not a failure to retry.
    retry: false,
  })

export const joinRequestsQuery = queryOptions({
  queryKey: linkKeys.requests,
  queryFn: () => api<{ requests: JoinRequest[] }>('/api/admin/students/requests'),
})
