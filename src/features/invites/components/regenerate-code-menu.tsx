'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ellipsis } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { regenerateInviteCode } from '../actions'

// ⋯ → Regenerate code on the compact invite card (contracts/ui-routes.md › /a/students; FR-003):
// after a confirm, the old code stops working at once; linked students stay linked.
export function RegenerateCodeMenu() {
  const t = useTranslations('invite')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const router = useRouter()
  const connection = useNeedsConnection()
  const [isConfirming, setConfirming] = useState(false)

  const regenerate = useMutation({
    mutationFn: async () => unwrap(await regenerateInviteCode({})),
    onSuccess: async () => {
      setConfirming(false)
      toast.success(t('regenerated'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      ])
      // The card itself is rendered on the server.
      router.refresh()
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label={t('menu')}
            className="text-inverse-foreground hover:bg-inverse-foreground/10 hover:text-inverse-foreground"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            className="min-h-11 text-base"
            disabled={connection.disabled}
            onSelect={() => setConfirming(true)}
          >
            {t('regenerate')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={isConfirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('regenerateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('regenerateBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {regenerate.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(regenerate.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <Button
              disabled={regenerate.isPending || connection.disabled}
              aria-describedby={connection.describedBy}
              onClick={() => regenerate.mutate()}
            >
              {t('regenerateAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
