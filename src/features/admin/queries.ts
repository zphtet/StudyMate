import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminOverview } from './types'

export const overviewQuery = queryOptions({
  queryKey: ['admin', 'overview'],
  queryFn: () => api<AdminOverview>('/api/admin/overview'),
})
