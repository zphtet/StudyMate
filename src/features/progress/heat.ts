// The shade of a day on the Progress calendar (spec 004 research.md R5): none; under 15 min; under 30;
// under 60; an hour or more. The colours are the --heat-1..4 tokens.

export type HeatLevel = 0 | 1 | 2 | 3 | 4

export function heatLevel(seconds: number): HeatLevel {
  if (seconds <= 0) return 0
  if (seconds < 15 * 60) return 1
  if (seconds < 30 * 60) return 2
  if (seconds < 60 * 60) return 3
  return 4
}
