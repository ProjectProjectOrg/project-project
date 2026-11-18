// Saving: one save at a time, the newest change waiting behind it.

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed"

export function nextMarkdownChange(
  currentMarkdown: string,
  nextMarkdown: string
) {
  if (nextMarkdown === currentMarkdown) return null
  return nextMarkdown
}

export function createCoalescedSaveQueue<A>(options: {
  readonly save: (value: A) => Promise<void> | void
  readonly schedule: () => void
  readonly onStatus: (status: SaveStatus) => void
  readonly onError: (error: unknown) => void
}) {
  let pending: A | null = null
  let inflight = false
  let unmounted = false

  const flush = (notify = true) => {
    if (inflight || pending === null) return undefined
    const next = pending
    pending = null
    inflight = true
    if (notify) options.onStatus("saving")
    let retainedFailure = false
    let saving: Promise<void>
    try {
      saving = Promise.resolve(options.save(next))
    } catch (error) {
      saving = Promise.reject(error)
    }
    saving = saving
      .then(() => {
        if (notify && pending === null) options.onStatus("saved")
      })
      .catch((error: unknown) => {
        if (pending === null) {
          pending = next
          retainedFailure = true
        }
        options.onError(error)
        if (notify) options.onStatus("failed")
      })
      .finally(() => {
        inflight = false
        if (pending !== null && !retainedFailure) {
          if (unmounted) void flush(false)
          else options.schedule()
        }
      })
    return saving
  }

  return {
    enqueue: (value: A) => {
      pending = value
    },
    flush,
    unmount: () => {
      unmounted = true
      void flush(false)
    }
  }
}
