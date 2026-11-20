'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'
import { getBrowserQueryClient } from './client'

export function QueryProvider({ children }: { children: ReactNode }) {
  const client = getBrowserQueryClient()
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  )
}
