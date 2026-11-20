import { Skeleton } from '@/components/ui/skeleton'

/** Instant placeholder while a tab's data loads (loading.tsx / Suspense; keeps navigations instant). */
export function PageSkeleton({ header = true }: { header?: boolean }) {
  return (
    <div className={header ? 'flex flex-col gap-4 pt-6' : 'flex flex-col gap-4'} aria-busy="true">
      {header && (
        <div className="flex flex-col gap-2 pb-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-44" />
        </div>
      )}
      <Skeleton className="h-28 w-full rounded-3xl" />
      {header && <Skeleton className="h-40 w-full rounded-2xl" />}
    </div>
  )
}
