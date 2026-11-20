import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MeResponse } from './types'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => api<MeResponse>('/api/me'),
})
