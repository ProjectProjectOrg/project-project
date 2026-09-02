export const MORPH_MS = 260

export const MORPH_EASE = [0.22, 1, 0.36, 1] as const

export const MORPH_EASING = `cubic-bezier(${MORPH_EASE.join(", ")})`

export const MORPH = {
  duration: MORPH_MS / 1000,
  ease: MORPH_EASE
} as const
