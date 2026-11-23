// What the Quiet hours row on Me says (spec 006 research R14). A student's shift and sleep blocks
// always count as quiet (FR-013), so the row names them; an Admin has only the window. Pure: the row
// turns the key into text in the viewer's language.

export type QuietHoursText =
  | { key: 'shiftSleep' }
  | { key: 'windowShiftSleep'; window: string }
  | { key: 'off' }
  | { key: 'window'; window: string }

export function quietHoursText({
  role,
  start,
  end,
}: {
  role: 'student' | 'admin'
  start: string | null
  end: string | null
}): QuietHoursText {
  // A window may cross midnight (22:00–07:00): it reads in the order it was set.
  const window = start && end ? `${start}–${end}` : null
  if (role === 'student')
    return window ? { key: 'windowShiftSleep', window } : { key: 'shiftSleep' }
  return window ? { key: 'window', window } : { key: 'off' }
}
