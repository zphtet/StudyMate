'use client'

import { useTranslations } from 'next-intl'
import { StatusChip } from '@/components/shared/status-chip'
import type { SubmissionStatus } from '../types'

// Submission status in the theme tones of contracts/ui-routes.md: Submitted (primary), Needs redo
// (warning), Reviewed (success). A Draft is muted; Admins never see one.
const TONE = {
  draft: 'muted',
  submitted: 'accent',
  needs_redo: 'warning',
  reviewed: 'success',
} as const

export function SubmissionStatusChip({ status }: { status: SubmissionStatus }) {
  const t = useTranslations('submission.status')
  return <StatusChip tone={TONE[status]}>{t(status)}</StatusChip>
}
