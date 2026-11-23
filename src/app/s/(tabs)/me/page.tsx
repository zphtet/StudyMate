import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/page-header'
import { MeView } from '@/features/profile/components/me-view'
import { WithMe } from '@/features/profile/components/with-me'
import { ShiftCalendarRow } from '@/features/shifts/components/shift-calendar-row'
import { WithShiftsToday } from '@/features/shifts/components/with-shifts'

export default async function StudentMePage() {
  const t = await getTranslations('me')
  return (
    <>
      <PageHeader title={t('title')} />
      <WithMe>
        <MeView
          studyRows={
            <WithShiftsToday>
              <ShiftCalendarRow />
            </WithShiftsToday>
          }
        />
      </WithMe>
    </>
  )
}
