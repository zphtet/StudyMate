import 'server-only'
import { randomInt } from 'node:crypto'

// Invite codes (research R11; data-model.md AdminInvite.code): 6 characters from the alphabet the
// admin_invites CHECK allows, without the look-alikes I, O, 0 and 1.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}
