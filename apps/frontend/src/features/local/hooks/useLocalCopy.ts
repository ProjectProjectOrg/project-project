import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type * as Cause from "effect/Cause"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"

import { localProject, localRuntime } from "../atoms/localProject"

export type LocalCopy =
  | Readonly<{ kind: "readable" }>
  | Readonly<{ kind: "syncing" }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{
      kind: "failed"
      cause: Cause.Cause<unknown> | null
      retry: () => void
    }>

export function useLocalCopy(): LocalCopy {
  const { orgSlug, slug } = useProjectRoute()
  const copy = localProject({ orgSlug, slug })
  const status = useAtomValue(copy)
  const retry = useAtomRefresh(copy)
  const restart = useAtomRefresh(localRuntime)
  return Result.match(status, {
    onInitial: (): LocalCopy => ({ kind: "readable" }),
    onFailure: ({ cause }): LocalCopy => ({
      kind: "failed",
      cause,
      retry: () => {
        restart()
        retry()
      }
    }),
    onSuccess: ({ value }): LocalCopy => {
      if (value.kind === "ready") return { kind: "readable" }
      if (value.kind === "initializing") return { kind: "syncing" }
      if (value.kind === "denied") return { kind: "denied" }
      return { kind: "failed", cause: null, retry }
    }
  })
}
