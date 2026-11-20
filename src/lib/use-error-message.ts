'use client'

import { useTranslations } from 'next-intl'
import { ApiError } from './api'
import { ActionResultError } from './result'

/** Turns an action/API error into a translated sentence (keys under `errors.*`). */
export function useErrorMessage() {
  const t = useTranslations('errors')
  return (error: unknown): string => {
    const code =
      error instanceof ActionResultError || error instanceof ApiError
        ? error.code
        : typeof navigator !== 'undefined' && !navigator.onLine
          ? 'offline'
          : 'unexpected'
    const params = error instanceof ActionResultError ? error.params : undefined
    return t.has(code) ? t(code, params) : t('unexpected')
  }
}

/** Translates a Zod issue message (keys under `validation.*`). */
export function useValidationMessage() {
  const t = useTranslations('validation')
  return (message?: string) => (message ? (t.has(message) ? t(message) : message) : undefined)
}
