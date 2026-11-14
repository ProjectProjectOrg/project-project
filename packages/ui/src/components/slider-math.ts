export const THUMB_SIZE = 20

export function valueToPixel(
  v: number,
  min: number,
  max: number,
  trackWidth: number
): number {
  if (max === min) return 0
  const usable = trackWidth - THUMB_SIZE
  return ((v - min) / (max - min)) * usable
}

export function nearestStepIndex(v: number, steps: number[]): number {
  let idx = 0
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(steps[i] - v) < Math.abs(steps[idx] - v)) idx = i
  }
  return idx
}

export function pixelToValue(
  px: number,
  min: number,
  max: number,
  step: number,
  trackWidth: number,
  stepValues: number[] | null = null
): number {
  const usable = trackWidth - THUMB_SIZE
  if (usable <= 0) return min
  const raw = (px / usable) * (max - min) + min
  if (stepValues) return stepValues[nearestStepIndex(raw, stepValues)]
  const snapped = Math.round((raw - min) / step) * step + min
  return Math.max(min, Math.min(max, snapped))
}
