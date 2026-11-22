// Spec 002 US2 (T037), research.md R6: the lesson editor saves 3 s after the last change.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { LessonFields, LessonFieldsInput } from './schemas'
import { MAX_CONTENT_BYTES } from '@/lib/content'
import { useAutosave } from './use-autosave'

const VALID: LessonFieldsInput = {
  title: 'Particles',
  estMinutes: 15,
  sectionId: null,
  unlockRule: { type: 'after_previous' },
  contentMd: '## は',
  assignmentPrompt: '',
  requireSubmission: false,
}

type Save = (values: LessonFields) => Promise<{ updatedAt: string }>

/** A save whose promise the test settles by hand. */
function deferredSave() {
  const calls: { values: LessonFields; resolve: (at: string) => void; reject: () => void }[] = []
  const save = vi.fn<Save>(
    (values) =>
      new Promise((resolve, reject) => {
        calls.push({
          values,
          resolve: (at) => resolve({ updatedAt: at }),
          reject: () => reject(new Error('offline')),
        })
      }),
  )
  return { save, calls }
}

function setup(save: Save) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    () => {
      const form = useForm<LessonFieldsInput, unknown, LessonFields>({ defaultValues: VALID })
      const autosave = useAutosave({
        lessonId: 'lesson-1',
        form,
        save,
        initialSavedAt: '2026-11-21T03:12:00.000Z',
      })
      return { form, autosave }
    },
    { wrapper },
  )
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useAutosave', () => {
  test('starts saved, with the server time', () => {
    const { result } = setup(vi.fn())
    expect(result.current.autosave.status).toBe('saved')
    expect(result.current.autosave.savedAt).toBe('2026-11-21T03:12:00.000Z')
    expect(result.current.autosave.unsaved).toBe(false)
  })

  test('saves 3 s after the last change, once, with the latest values', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(save)
    act(() => result.current.form.setValue('title', 'Particles は'))
    expect(result.current.autosave.unsaved).toBe(true)
    await advance(2000)
    act(() => result.current.form.setValue('title', 'Particles は vs が'))
    await advance(2999)
    expect(save).not.toHaveBeenCalled()
    await advance(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(calls[0].values.title).toBe('Particles は vs が')
    expect(result.current.autosave.status).toBe('saving')

    await act(async () => calls[0].resolve('2026-11-21T03:42:00.000Z'))
    expect(result.current.autosave.status).toBe('saved')
    expect(result.current.autosave.savedAt).toBe('2026-11-21T03:42:00.000Z')
    expect(result.current.autosave.unsaved).toBe(false)
  })

  test('runs one save at a time per lesson (mutation scope)', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(save)
    act(() => result.current.form.setValue('title', 'First'))
    await advance(3000)
    act(() => result.current.form.setValue('title', 'Second'))
    await advance(3000)
    // The second save waits for the first.
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => calls[0].resolve('2026-11-21T03:42:00.000Z'))
    await advance(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls[1].values.title).toBe('Second')
    // Saved only once the newest change is stored.
    expect(result.current.autosave.unsaved).toBe(true)
    await act(async () => calls[1].resolve('2026-11-21T03:43:00.000Z'))
    expect(result.current.autosave.unsaved).toBe(false)
    expect(result.current.autosave.savedAt).toBe('2026-11-21T03:43:00.000Z')
  })

  test('flushes when the page is hidden', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(save)
    act(() => result.current.form.setValue('estMinutes', 20))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(calls[0].values.estMinutes).toBe(20)
    visibility.mockRestore()
  })

  test('flush() saves pending changes at once and reports success', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(save)
    act(() => result.current.form.setValue('contentMd', '## が'))
    let flushed: Promise<boolean> | undefined
    // TanStack Query starts a mutation a few microtasks later.
    await act(async () => {
      flushed = result.current.autosave.flush()
    })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => calls[0].resolve('2026-11-21T03:50:00.000Z'))
    await expect(flushed).resolves.toBe(true)
    // Nothing pending: flush is a no-op that succeeds.
    await act(async () => {
      await expect(result.current.autosave.flush()).resolves.toBe(true)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  test('does not save while the form is invalid', async () => {
    const save = vi.fn<Save>()
    const { result } = setup(save)
    act(() => result.current.form.setValue('title', ''))
    await advance(3000)
    expect(save).not.toHaveBeenCalled()
    expect(result.current.autosave.status).toBe('invalid')
    expect(result.current.autosave.unsaved).toBe(true)
    await act(async () => {
      await expect(result.current.autosave.flush()).resolves.toBe(false)
    })
  })

  test('pauses above the data-model.md Lesson.contentMd limit', async () => {
    const save = vi.fn<Save>()
    const { result } = setup(save)
    act(() => result.current.form.setValue('contentMd', 'あ'.repeat(MAX_CONTENT_BYTES / 3 + 1)))
    await advance(3000)
    expect(save).not.toHaveBeenCalled()
    expect(result.current.autosave.status).toBe('paused')
    expect(result.current.autosave.unsaved).toBe(true)
  })

  test('status goes saving → error, and retry() saves again', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(save)
    act(() => result.current.form.setValue('title', 'Offline edit'))
    await advance(3000)
    expect(result.current.autosave.status).toBe('saving')
    await act(async () => calls[0].reject())
    expect(result.current.autosave.status).toBe('error')
    expect(result.current.autosave.unsaved).toBe(true)

    await act(async () => result.current.autosave.retry())
    expect(save).toHaveBeenCalledTimes(2)
    await act(async () => calls[1].resolve('2026-11-21T04:00:00.000Z'))
    expect(result.current.autosave.status).toBe('saved')
  })

  test('warns before unload while changes are unsaved', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(save)
    const event = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(event()).toBe(false)
    act(() => result.current.form.setValue('title', 'Unsaved'))
    expect(event()).toBe(true)
    await advance(3000)
    await act(async () => calls[0].resolve('2026-11-21T04:10:00.000Z'))
    expect(event()).toBe(false)
  })
})
