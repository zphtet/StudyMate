'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { applyAppearance, type Appearance } from '@/lib/appearance'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { saveAppearance } from '../actions'
import { meQuery } from '../queries'
import type { SaveAppearanceInput } from '../schemas'
import type { MeResponse } from '../types'

const lookOf = (me: MeResponse): Appearance => ({
  colorMode: me.colorMode,
  themeId: me.themeId,
  fontId: me.fontId,
  textSize: me.textSize,
})

/**
 * Spec 007 research R9, FR-002, FR-014: the account's look, and `change()` to apply a choice on
 * this device at once (no Save button), save it, and on failure put the saved look back and say so.
 * The action writes this device's `appearance` cookie on success.
 */
export function useAppearance() {
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const { setTheme } = useTheme()
  const { data: me } = useSuspenseQuery(meQuery)

  const apply = (look: Appearance) => {
    applyAppearance(document, look)
    setTheme(look.colorMode)
  }

  const save = useMutation({
    mutationFn: async (change: SaveAppearanceInput) => unwrap(await saveAppearance(change)),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: meQuery.queryKey })
      const previous = queryClient.getQueryData(meQuery.queryKey)
      if (previous) {
        const next = { ...previous, ...change }
        apply(lookOf(next))
        queryClient.setQueryData(meQuery.queryKey, next)
      }
      return { previous }
    },
    onError: (error, _change, context) => {
      if (context?.previous) {
        queryClient.setQueryData(meQuery.queryKey, context.previous)
        apply(lookOf(context.previous))
      }
      toast.error(errorMessage(error))
    },
  })

  return { look: lookOf(me), change: (change: SaveAppearanceInput) => save.mutate(change) }
}
