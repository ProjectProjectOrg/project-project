import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { JANK_SECONDS, jankPerSecond, type LongFrame } from "../lib/jank"
import { listEndpointOf } from "../lib/listRequests"

const LONG_FRAME = "long-animation-frame"

const watchLongFrames = Effect.acquireRelease(
  Effect.sync(() => {
    let frames: ReadonlyArray<LongFrame> = []
    const observer = new PerformanceObserver((list) => {
      frames = [
        ...frames,
        ...list.getEntries().map(({ startTime, duration }) => ({
          startTime,
          duration
        }))
      ]
    })
    observer.observe({ type: LONG_FRAME, buffered: true })
    const sample = () => {
      const now = performance.now()
      const cutoff = now - JANK_SECONDS * 1000
      frames = frames.filter(
        (frame) => frame.startTime + frame.duration > cutoff
      )
      return jankPerSecond(frames, now)
    }
    return { observer, sample }
  }),
  ({ observer }) => Effect.sync(() => observer.disconnect())
)

const jankSamples = Stream.unwrap(
  Effect.map(watchLongFrames, ({ sample }) =>
    Stream.tick("1 second").pipe(Stream.map(sample))
  )
)

export const mainThreadJank = Atom.make(
  PerformanceObserver.supportedEntryTypes.includes(LONG_FRAME)
    ? jankSamples
    : Stream.make(null)
)

type ListRequest = Readonly<{ endpoint: string; at: number }>

const listRequestLog = Atom.make((get): ReadonlyArray<ListRequest> => {
  let log: ReadonlyArray<ListRequest> = []
  const observer = new PerformanceObserver((list) => {
    const requests = list.getEntries().flatMap(({ name, startTime }) => {
      const endpoint = listEndpointOf(new URL(name).pathname)
      return endpoint === null ? [] : [{ endpoint, at: startTime }]
    })
    if (requests.length === 0) return
    log = [...log, ...requests]
    get.setSelf(log)
  })
  observer.observe({ type: "resource", buffered: true })
  get.addFinalizer(() => observer.disconnect())
  return []
}).pipe(Atom.keepAlive)

export const listRequestsSince = Atom.make(0)

export const listRequestCounts = Atom.make((get) => {
  const since = get(listRequestsSince)
  const counts = new Map<string, number>()
  for (const { endpoint, at } of get(listRequestLog))
    if (at >= since) counts.set(endpoint, (counts.get(endpoint) ?? 0) + 1)
  return counts
})
