'use client'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { MAX_CONTENT_BYTES, utf8Bytes } from '@/lib/content'
import { lessonFieldsSchema, type LessonFields, type LessonFieldsInput } from './schemas'

// Lesson autosave (spec 002 US2 scenario 5, research.md R6). 3 s after the last change every field
// is saved at once; saves for one lesson run one after another (mutation scope). Pending changes are
// also saved when the page is hidden, and callers flush before leaving or publishing. While changes
// are unsaved, closing the tab asks for confirmation.

export type AutosaveStatus =
  /** everything is stored */
  | 'saved'
  /** changes wait for the 3 s pause */
  | 'pending'
  | 'saving'
  /** the last save failed: "Not saved · Retry" */
  | 'error'
  /** a field is invalid; nothing is sent */
  | 'invalid'
  /** above the data-model.md Lesson.contentMd limit; nothing is sent */
  | 'paused'

export const AUTOSAVE_DELAY = 3000

export function useAutosave({
  lessonId,
  form,
  save,
  initialSavedAt,
  onSaved,
  delay = AUTOSAVE_DELAY,
}: {
  lessonId: string
  form: UseFormReturn<LessonFieldsInput, unknown, LessonFields>
  save: (values: LessonFields) => Promise<{ updatedAt: string }>
  initialSavedAt: string
  onSaved?: (values: LessonFields, updatedAt: string) => void
  delay?: number
}) {
  const [status, setStatusState] = useState<AutosaveStatus>('saved')
  const [savedAt, setSavedAt] = useState(initialSavedAt)
  const statusRef = useRef<AutosaveStatus>('saved')
  const setStatus = useCallback((next: AutosaveStatus) => {
    statusRef.current = next
    setStatusState(next)
  }, [])

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Bumped on every change; `requested` / `stored` say which change a save carries / has stored. */
  const version = useRef(0)
  const requested = useRef(0)
  const stored = useRef(0)
  const inFlight = useRef(0)
  const last = useRef<Promise<boolean> | null>(null)

  const { mutateAsync } = useMutation({
    mutationFn: save,
    scope: { id: `lesson:${lessonId}` },
    retry: false,
  })

  const latest = useRef({ mutateAsync, onSaved })
  useEffect(() => {
    latest.current = { mutateAsync, onSaved }
  })

  const run = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current)
    timer.current = undefined
    const values = form.getValues()
    if (utf8Bytes(values.contentMd ?? '') > MAX_CONTENT_BYTES) {
      setStatus('paused')
      return Promise.resolve(false)
    }
    const parsed = lessonFieldsSchema.safeParse(values)
    if (!parsed.success) {
      setStatus('invalid')
      void form.trigger()
      return Promise.resolve(false)
    }

    const target = version.current
    requested.current = target
    inFlight.current += 1
    setStatus('saving')
    const promise = latest.current
      .mutateAsync(parsed.data)
      .then(({ updatedAt }) => {
        inFlight.current -= 1
        stored.current = Math.max(stored.current, target)
        setSavedAt(updatedAt)
        latest.current.onSaved?.(parsed.data, updatedAt)
        setStatus(
          inFlight.current > 0
            ? 'saving'
            : stored.current === version.current
              ? 'saved'
              : 'pending',
        )
        return true
      })
      .catch(() => {
        inFlight.current -= 1
        requested.current = stored.current
        setStatus(inFlight.current > 0 ? 'saving' : 'error')
        return false
      })
    last.current = promise
    return promise
  }, [form, setStatus])

  /** Saves pending changes now. Resolves true when everything is stored. */
  const flush = useCallback((): Promise<boolean> => {
    if (version.current === stored.current && statusRef.current !== 'error') {
      return last.current && inFlight.current > 0 ? last.current : Promise.resolve(true)
    }
    if (version.current === requested.current && inFlight.current > 0 && last.current) {
      return last.current
    }
    return run()
  }, [run])

  const retry = useCallback(() => {
    void run()
  }, [run])

  // Every change restarts the 3 s timer.
  useEffect(() => {
    const subscription = form.watch(() => {
      version.current += 1
      if (statusRef.current !== 'saving') setStatus('pending')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void run(), delay)
    })
    return () => subscription.unsubscribe()
  }, [form, delay, run, setStatus])

  // Save when the page is hidden (tab switch, app switch, screen off).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [flush])

  // Ask before closing the tab while changes are unsaved.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (statusRef.current === 'saved') return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { status, savedAt, unsaved: status !== 'saved', flush, retry }
}
