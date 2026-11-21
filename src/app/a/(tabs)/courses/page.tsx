import { Plus, Trash2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { AdminCourseList } from '@/features/courses/components/admin-course-list'
import { WithAdminCourses } from '@/features/courses/components/with-admin-course'

// Admin Courses (screen 17-AdminCourses; spec 002 US1, FR-009).
export default async function AdminCoursesPage() {
  const t = await getTranslations('courses')
  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <Button asChild size="touch" className="rounded-2xl px-5">
            <Link href="/a/courses/new">
              <Plus aria-hidden /> {t('new')}
            </Link>
          </Button>
        }
      />
      <WithAdminCourses>
        <AdminCourseList
          footer={
            <Link
              href="/a/courses/deleted"
              className="mx-auto flex min-h-11 items-center gap-2 px-4 text-muted-foreground underline-offset-4 hover:underline"
            >
              <Trash2 className="size-4" aria-hidden /> {t('recentlyDeleted')}
            </Link>
          }
        />
      </WithAdminCourses>
    </>
  )
}
