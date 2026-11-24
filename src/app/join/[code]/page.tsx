import type { Metadata } from 'next'
import { JoinScreen } from '@/features/links/components/join-screen'

export const metadata: Metadata = { title: 'Connect to your admin' }

// Screen 03-Join from an invite link or QR code (spec 001 User Story 2 scenario 1).
export default function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  return <JoinScreen code={params.then((p) => p.code)} />
}
