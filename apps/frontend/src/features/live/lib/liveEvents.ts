import type { LiveEvent } from "@pp/shared"

type Listener = (event: LiveEvent) => void

const listeners = new Set<Listener>()

export const onLiveEvent = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const emitLiveEvent = (event: LiveEvent) => {
  for (const listener of listeners) listener(event)
}
