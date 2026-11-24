import type { Metadata } from 'next'
import { JoinScreen } from '@/features/links/components/join-screen'

export const metadata: Metadata = { title: 'Connect to your admin' }

// Screen 03-Join without a code (spec 001 User Story 2).
export default function JoinPage() {
  return <JoinScreen code={Promise.resolve('')} />
}
