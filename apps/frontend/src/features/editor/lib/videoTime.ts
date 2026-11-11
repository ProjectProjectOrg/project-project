export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.5] as const

export const nextPlaybackRate = (rate: number): number => {
  const index = PLAYBACK_RATES.findIndex((candidate) => candidate === rate)
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
}

const pad = (value: number): string => String(value).padStart(2, "0")

export const formatVideoTime = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`
}

export const videoProgress = (time: number, duration: number): number =>
  Number.isFinite(duration) && duration > 0
    ? Math.min(Math.max(time / duration, 0), 1)
    : 0
