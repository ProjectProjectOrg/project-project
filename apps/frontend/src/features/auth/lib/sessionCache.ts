import { Unauthorized } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Registry from "effect/reactivity/AtomRegistry"

import {
  clearSnapshot,
  readSnapshot,
  restoreQueries,
  saveSnapshot,
  shownQueries,
  type Snapshot
} from "@/api/querySnapshot"
import { logout, me } from "@/features/auth/atoms/auth"

export function createSessionCache<
  Router extends { cancelMatches: () => void }
>(
  createRouter: (registry: Registry.AtomRegistry) => Router,
  build: string | undefined,
  viewer: string | null
) {
  const listeners = new Set<() => void>()
  const stored = build === undefined ? null : readSnapshot(build, viewer)
  let identity: string | null | undefined = stored?.user
  let trusted = true
  let disposed = false
  let generation = 0
  const makeSession = (
    viewer?: Atom.Type<ReturnType<typeof me>>,
    queries?: Snapshot["queries"]
  ) => {
    const registry = Registry.make({
      initialValues: viewer ? [[me(), viewer]] : undefined
    })
    if (queries !== undefined) restoreQueries(registry, queries)
    return {
      registry,
      router: createRouter(registry),
      ready: viewer !== undefined || queries !== undefined,
      generation: generation++
    }
  }
  let session = makeSession(undefined, stored?.queries)
  let stopWatching = () => {}
  const notify = () => listeners.forEach((listener) => listener())

  const replace = (
    viewer: Atom.Type<ReturnType<typeof me>>,
    nextIdentity: string | null
  ) => {
    const previous = session
    stopWatching()
    clearSnapshot()
    previous.router.cancelMatches()
    identity = nextIdentity
    trusted = Result.isSuccess(viewer)
    session = makeSession(viewer)
    watch()
    notify()
    queueMicrotask(() => previous.registry.dispose())
  }

  const watch = () => {
    const { registry } = session
    const stopIdentity = registry.subscribe(me(), (viewer) => {
      if (disposed || registry !== session.registry) return
      const nextIdentity = Result.matchWithError(viewer, {
        onInitial: () => undefined,
        onSuccess: ({ value }) => value.id,
        onError: () => null,
        onDefect: () => undefined
      })
      if (
        session.ready &&
        nextIdentity !== undefined &&
        identity !== nextIdentity
      ) {
        replace(viewer, nextIdentity)
        return
      }
      if (nextIdentity !== undefined) identity = nextIdentity
      if (Result.isSuccess(viewer) && !viewer.waiting) trusted = true
      if (!session.ready && !Result.isInitial(viewer)) {
        session = { ...session, ready: true }
        notify()
      }
    })
    const stopLogout = registry.subscribe(logout, (result) => {
      if (
        !disposed &&
        registry === session.registry &&
        Result.isSuccess(result) &&
        !result.waiting
      ) {
        replace(Result.fail(new Unauthorized()), null)
      }
    })
    stopWatching = () => {
      stopIdentity()
      stopLogout()
    }
    registry.get(me())
  }

  watch()

  return {
    getSnapshot: () => session,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    refreshIdentity: () => {
      if (!disposed) session.registry.refresh(me())
    },
    distrust: () => {
      if (disposed) return
      trusted = false
      session.registry.refresh(me())
    },
    persist: () => {
      if (disposed || !trusted || build === undefined) return
      if (identity === undefined || identity === null) return
      saveSnapshot({
        user: identity,
        build,
        queries: shownQueries(session.registry)
      })
    },
    dispose: () => {
      disposed = true
      stopWatching()
      session.router.cancelMatches()
      session.registry.dispose()
      listeners.clear()
    }
  }
}
