import { PageSkeleton } from '@/components/layout/page-skeleton'

// Shown instantly while a section's layout checks the session (e.g. sign-in → /s/today).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md px-5">
      <PageSkeleton />
    </div>
  )
}
