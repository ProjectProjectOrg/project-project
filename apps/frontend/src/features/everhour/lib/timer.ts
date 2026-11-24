const padClockPart = (value: number) => `${value}`.padStart(2, "0")

export const formatClock = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return hours > 0
    ? `${hours}:${padClockPart(minutes)}:${padClockPart(secs)}`
    : `${minutes}:${padClockPart(secs)}`
}

export const timerEntryMotion = (reduceMotion: boolean) =>
  reduceMotion
    ? { initial: false as const, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: -2 }, animate: { opacity: 1, y: 0 } }

export const startSecondInterval = (update: () => void) => {
  update()
  const interval = window.setInterval(update, 1000)
  return () => window.clearInterval(interval)
}
