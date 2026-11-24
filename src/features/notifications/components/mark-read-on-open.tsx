'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { z } from 'zod'
import { unwrap } from '@/lib/result'
import { markNotificationRead } from '../actions'
import { notificationKeys } from '../queries'

// A tapped phone notification opens its page with `?n=<id>` (src/app/sw.ts): mark that item read and
// drop the parameter (FR-007; research R9). Also refreshes the bell when the service worker reports a
// push to an open window. Mounted once per role layout.

const idSchema = z.uuid()

export function MarkReadOnOpen() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const opened = idSchema.safeParse(searchParams.get('n'))

  const markRead = useMutation({
    mutationFn: async (id: string) => unwrap(await markNotificationRead({ id })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
  const { mutate } = markRead

  const openedId = opened.success ? opened.data : null
  useEffect(() => {
    if (!openedId) return
    mutate(openedId)
    const rest = new URLSearchParams(searchParams)
    rest.delete('n')
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false })
  }, [openedId, mutate, pathname, router, searchParams])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'notifications') {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [queryClient])

  return null
}
