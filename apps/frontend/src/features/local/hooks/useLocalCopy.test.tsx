import { RegistryContext } from "@effect/atom-react"
import type { LocalStatus } from "@pp/local"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Cause from "effect/Cause"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, expect, it } from "vitest"

import { projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"

import { localProject } from "../atoms/localProject"
import { useLocalCopy } from "./useLocalCopy"

const copy = localProject({ orgSlug: "acme", slug: "web" })
const project = projectRequest("acme", "web")

let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
})

const renderCopy = (status: Result.AsyncResult<LocalStatus, unknown>) => {
  const active = Registry.make({ initialValues: [[copy, status]] })
  registry = active
  const rendered = renderHook(() => useLocalCopy(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <RegistryContext.Provider value={active}>
        <ProjectContext.Provider value={project}>
          {children}
        </ProjectContext.Provider>
      </RegistryContext.Provider>
    )
  })
  return { registry: active, result: rendered.result }
}

it("holds a project view behind the loader while the copy's first sync runs", () => {
  const { result } = renderCopy(Result.success({ kind: "initializing" }))
  expect(result.current.kind).toBe("syncing")
})

it("shows the view once the copy is ready", () => {
  const { result } = renderCopy(
    Result.success({ kind: "ready", sync: "behind" })
  )
  expect(result.current.kind).toBe("readable")
})

it("reports lost access as denied", () => {
  const { result } = renderCopy(Result.success({ kind: "denied" }))
  expect(result.current.kind).toBe("denied")
})

it("reports a failed first sync, and its retry runs the pull again", () => {
  const failed = Result.success<LocalStatus>({ kind: "failed" })
  const { registry, result } = renderCopy(failed)
  const shown = result.current
  if (shown.kind !== "failed") throw new Error(`shown ${shown.kind}`)
  act(() => shown.retry())
  expect(registry.get(copy)).not.toBe(failed)
})

it("reports a local worker that can't start as failed, with its cause", () => {
  const cause = Cause.die(new Error("no worker"))
  const { result } = renderCopy(Result.failure(cause))
  expect(result.current).toMatchObject({ kind: "failed", cause })
})
