import { PageSkeleton } from '@/components/layout/page-skeleton'

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md px-6 pt-8">
      <PageSkeleton />
    </div>
  )
}
