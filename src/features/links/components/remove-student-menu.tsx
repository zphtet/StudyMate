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
import { removeStudent } from '../actions'

// ⋯ → Remove student on the Admin's student screen (contracts/server-actions.md › removeStudent;
// spec 001 Edge Cases): after a confirm the link ends; the student keeps their own history.
export function RemoveStudentMenu({ studentId }: { studentId: string }) {
  const t = useTranslations('adminStudents')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const router = useRouter()
  const connection = useNeedsConnection()
  const [isConfirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: async () => unwrap(await removeStudent({ studentId })),
    onSuccess: () => {
      toast.success(t('removed'))
      // Stale, not refetched now: this screen's own query would fail on its way out (the student is
      // no longer linked). Lists refetch when they next show.
      void queryClient.invalidateQueries({ queryKey: ['admin'], refetchType: 'none' })
      router.replace('/a/students')
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-touch" aria-label={t('menu')}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            variant="destructive"
            className="min-h-11 text-base"
            disabled={connection.disabled}
            onSelect={() => setConfirming(true)}
          >
            {t('remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={isConfirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(remove.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending || connection.disabled}
              aria-describedby={connection.describedBy}
              onClick={() => remove.mutate()}
            >
              {t('removeAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
