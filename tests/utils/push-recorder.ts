import type { PushPayload, PushResult, PushSender, PushTarget } from '@/server/notifications/push'

// A PushSender for tests (spec 006 research R6): records every push instead of sending it, and
// answers what the test asks for (e.g. 'gone' for an expired device).

export type SentPush = { target: PushTarget; payload: PushPayload }

export function pushRecorder(answer: (target: PushTarget) => PushResult = () => 'ok') {
  const sent: SentPush[] = []
  const sender: PushSender = {
    async send(target, payload) {
      sent.push({ target, payload })
      return answer(target)
    },
  }
  return { sender, sent }
}
