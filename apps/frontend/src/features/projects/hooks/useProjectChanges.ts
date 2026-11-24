import { RegistryContext, useAtomSet } from "@effect/atom-react"
import { ProjectChange } from "@pp/shared"
import * as Option from "effect/Option"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { use, useEffect, useEffectEvent } from "react"

import type { ReactivityKey } from "@/api/keys"
import { streamedKeys } from "@/api/query"
import { invalidateProjectKeys } from "@/features/projects/atoms/projectChanges"
import {
  changeKeys,
  resyncKeys,
  streamedProjectKeys
} from "@/features/projects/lib/projectChanges"

const REWARM_DELAY_MS = 1000
const REWARM_INTERVAL_MS = 10_000
const SILENCE_MS = 60_000
const connectedProjects = new WeakMap<AtomRegistry, Set<string>>()

const decodeChanges = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(ProjectChange))
)

export function useProjectChanges(
  orgSlug: string,
  slug: string,
  rewarm: () => void
) {
  const registry = use(RegistryContext)
  const invalidate = useAtomSet(invalidateProjectKeys)
  const setStreamed = useAtomSet(streamedKeys)
  const onRewarm = useEffectEvent(rewarm)

  useEffect(
    () =>
      subscribeProjectChanges({
        orgSlug,
        slug,
        registry,
        invalidate,
        setStreamed,
        onRewarm
      }),
    [orgSlug, slug, registry, invalidate, setStreamed]
  )
}

function subscribeProjectChanges({
  orgSlug,
  slug,
  registry,
  invalidate,
  setStreamed,
  onRewarm
}: Readonly<{
  orgSlug: string
  slug: string
  registry: AtomRegistry
  invalidate: (keys: ReadonlyArray<ReactivityKey>) => void
  setStreamed: (
    update: (keys: ReadonlySet<unknown>) => ReadonlySet<unknown>
  ) => void
  onRewarm: () => void
}>) {
  const params = { orgSlug, slug }
  const streamed = new Set<unknown>(streamedProjectKeys(params))
  const url = `/api/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(slug)}/tickets/events`
  const connected = connectedProjects.get(registry) ?? new Set<string>()
  connectedProjects.set(registry, connected)
  let needsResync = connected.has(url) || document.visibilityState !== "visible"
  let catchUpOnHeartbeat = false
  let source: EventSource | null = null
  let streaming = false
  let retry: number | undefined
  let silence: number | undefined
  let delay = 1000
  let warming: number | undefined
  let warmedAt = -REWARM_INTERVAL_MS

  const scheduleRewarm = () => {
    if (warming !== undefined) return
    warming = window.setTimeout(
      () => {
        warming = undefined
        if (document.visibilityState !== "visible") return
        warmedAt = performance.now()
        onRewarm()
      },
      Math.max(
        REWARM_DELAY_MS,
        warmedAt + REWARM_INTERVAL_MS - performance.now()
      )
    )
  }
  const stream = (on: boolean) => {
    if (on === streaming) return
    streaming = on
    setStreamed((keys) =>
      on
        ? new Set([...keys, ...streamed])
        : new Set([...keys].filter((key) => !streamed.has(key)))
    )
  }
  const apply = (keys: ReadonlyArray<ReactivityKey>) => {
    if (keys.length === 0) return
    invalidate(keys)
    scheduleRewarm()
  }
  const heard = () => {
    window.clearTimeout(silence)
    silence = window.setTimeout(() => {
      close()
      open()
    }, SILENCE_MS)
  }
  const open = () => {
    window.clearTimeout(retry)
    if (source !== null) return
    const next = new EventSource(url)
    source = next
    next.addEventListener("open", () => {
      heard()
      delay = 1000
      if (needsResync) apply(resyncKeys(params))
      catchUpOnHeartbeat = !needsResync
      needsResync = false
      connected.add(url)
      stream(true)
    })
    next.addEventListener("message", (event: MessageEvent<unknown>) => {
      heard()
      const changes = decodeChanges(event.data)
      if (Option.isNone(changes)) return
      if (catchUpOnHeartbeat && changes.value.length === 0) {
        catchUpOnHeartbeat = false
        apply(resyncKeys(params))
        return
      }
      apply([
        ...new Set(
          changes.value.flatMap((change) => changeKeys(params, change))
        )
      ])
    })
    next.addEventListener("error", () => {
      needsResync = true
      stream(false)
      if (next.readyState !== EventSource.CLOSED) return
      source = null
      retry = window.setTimeout(open, delay)
      delay = Math.min(delay * 2, 30_000)
    })
  }
  const close = () => {
    window.clearTimeout(retry)
    window.clearTimeout(silence)
    if (source !== null) {
      needsResync = true
      source.close()
    }
    source = null
  }
  const follow = () =>
    document.visibilityState === "visible" ? open() : close()

  follow()
  document.addEventListener("visibilitychange", follow)
  return () => {
    document.removeEventListener("visibilitychange", follow)
    window.clearTimeout(warming)
    close()
    stream(false)
  }
}
