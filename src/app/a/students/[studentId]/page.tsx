import { Screen } from '@/components/layout/screen'
import { RemoveStudentMenu } from '@/features/links/components/remove-student-menu'
import { StudentDetail } from '@/features/progress/components/student-detail'
import { WithAdminStudent } from '@/features/progress/components/with-admin-progress'

// The Admin's view of one linked student (spec 004 US1 scenario 4; contracts/ui-routes.md › Student),
// with ⋯ → Remove student (spec 001; the Students list's cards stay as in 16-AdminStudents).
export default function AdminStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const studentId = params.then((p) => p.studentId)
  return (
    <Screen>
      <WithAdminStudent studentId={studentId}>
        <StudentView studentId={studentId} />
      </WithAdminStudent>
    </Screen>
  )
}

async function StudentView({ studentId }: { studentId: Promise<string> }) {
  const id = await studentId
  return <StudentDetail studentId={id} menu={<RemoveStudentMenu studentId={id} />} />
}
