export type LongFrame = Readonly<{ startTime: number; duration: number }>

export const JANK_SECONDS = 10

const SECOND = 1000

const overlap = (frame: LongFrame, start: number, end: number) =>
  Math.max(
    0,
    Math.min(end, frame.startTime + frame.duration) -
      Math.max(start, frame.startTime)
  )

export const jankPerSecond = (
  frames: ReadonlyArray<LongFrame>,
  now: number
): ReadonlyArray<Readonly<{ secondsAgo: number; share: number }>> =>
  Array.from({ length: JANK_SECONDS }, (_, index) => {
    const secondsAgo = JANK_SECONDS - 1 - index
    const end = now - secondsAgo * SECOND
    const busy = frames.reduce(
      (total, frame) => total + overlap(frame, end - SECOND, end),
      0
    )
    return { secondsAgo, share: busy / SECOND }
  })
