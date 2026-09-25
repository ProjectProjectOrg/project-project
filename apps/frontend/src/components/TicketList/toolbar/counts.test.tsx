import { GroupId, TicketListQuery } from "@pp/shared"
import { cleanup, renderHook } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { afterEach, expect, it, vi } from "vitest"

import type { ViewCountsSource } from "@/features/tickets/atoms/viewCounts"

import { useViewTicketCounts } from "./counts"

vi.mock("@/features/projects/atoms/projectStatuses", async () => {
  const Atom = await import("effect/unstable/reactivity/Atom")
  const AsyncResult = await import("effect/unstable/reactivity/AsyncResult")
  return {
    statusesRequest: (orgSlug: string, slug: string) => ({ orgSlug, slug }),
    statusesFor: Atom.family(() =>
      Atom.make(
        AsyncResult.success([
          { slug: "todo", orderKey: "a" },
          { slug: "in_progress", orderKey: "b" },
          { slug: "done", orderKey: "c" }
        ])
      )
    )
  }
})

vi.mock("@/features/tickets/atoms/viewCounts", async () => {
  const Atom = await import("effect/unstable/reactivity/Atom")
  const AsyncResult = await import("effect/unstable/reactivity/AsyncResult")
  return {
    viewCounts: Atom.family((source: ViewCountsSource) =>
      Atom.make(
        source.query.status?.some((status) => status === "in_progress")
          ? AsyncResult.fail(new Error("count failed"))
          : source.query.status?.length ||
              source.query.type?.length ||
              (source.groupId && source.view === "list")
            ? AsyncResult.initial()
            : AsyncResult.success({
                total: 7,
                byStatus: { todo: 5, in_progress: 1, done: 1 }
              })
      )
    )
  }
})

const decodeQuery = Schema.decodeSync(TicketListQuery)
const decodeGroupId = Schema.decodeSync(GroupId)

afterEach(cleanup)

it("keeps known status counts during a first fetch without masking other requests or failures", () => {
  const { result, rerender } = renderHook(
    ({ status, type }) =>
      useViewTicketCounts({
        orgSlug: "org",
        slug: "project",
        groupId: null,
        view: "list",
        grouping: "sprint",
        query: decodeQuery({
          status: status ? [status] : undefined,
          type: type ? ["bug" as const] : undefined,
          sort: { key: "title", dir: "asc" }
        })
      }),
    { initialProps: { status: "", type: "" } }
  )

  expect(Result.isSuccess(result.current) && result.current.value).toEqual({
    all: 7,
    todo: 5,
    in_progress: 1,
    done: 1
  })

  rerender({ status: "done", type: "" })
  expect(
    Result.isSuccess(result.current) && result.current.value
  ).toMatchObject({
    done: 1
  })

  rerender({ status: "in_progress", type: "" })
  expect(Result.isFailure(result.current)).toBe(true)

  rerender({ status: "done", type: "bug" })
  expect(Result.isInitial(result.current)).toBe(true)
})

it("keeps sprint counts while the list loads for the first time", () => {
  const sprintId = decodeGroupId("G-1")
  const otherSprintId = decodeGroupId("G-2")
  const initialProps: Readonly<{ groupId: GroupId; view: "board" | "list" }> = {
    groupId: sprintId,
    view: "board"
  }
  const { result, rerender } = renderHook(
    ({
      groupId,
      view
    }: Readonly<{ groupId: GroupId; view: "board" | "list" }>) =>
      useViewTicketCounts({
        orgSlug: "org",
        slug: "project",
        groupId,
        view,
        grouping: "status",
        query: decodeQuery({ groupId: [groupId] })
      }),
    { initialProps }
  )

  expect(Result.isSuccess(result.current) && result.current.value.all).toBe(7)

  rerender({ groupId: sprintId, view: "list" })
  expect(Result.isSuccess(result.current) && result.current.value.all).toBe(7)

  rerender({ groupId: otherSprintId, view: "list" })
  expect(Result.isInitial(result.current)).toBe(true)
})
