import { RegistryContext } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider
} from "@tanstack/react-router"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { afterEach, expect, it, vi } from "vitest"

import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import {
  ticketSequence,
  ticketSequenceRequest
} from "@/features/tickets/atoms/ticketSequence"

import { useTicketParticipants } from "./useTicketParticipants"
import { useTicketStepping } from "./useTicketStepping"

const id = Schema.decodeSync(TicketId)
const [t1, t2, t3] = [id("T-1"), id("T-2"), id("T-3")]
let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
  vi.useRealTimers()
})

const pressJ = () => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }))
  })
}

const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const commentsRead = (ticket: TicketId) =>
  registry?.getNodes().has(comments(commentsRequest("acme", "app", ticket)))

it("loads side data only for the ticket the user settles on", () => {
  vi.useFakeTimers()
  registry = Registry.make({
    initialValues: [
      [
        ticketSequence(ticketSequenceRequest("acme", "app", t1, undefined)),
        Result.success({
          within: "parent" as const,
          tickets: [t1, t2, t3].map((ticket) => ({ id: ticket, title: ticket }))
        })
      ]
    ]
  })
  const activeRegistry = registry
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory()
  })
  const { result } = renderHook(
    () => {
      const stepping = useTicketStepping(t1, undefined, undefined)
      useTicketParticipants(stepping.shown, stepping.settled)
      return stepping
    },
    {
      wrapper: ({ children }) => (
        <RegistryContext.Provider value={activeRegistry}>
          <RouterContextProvider router={router}>
            <ProjectContext.Provider value={projectRequest("acme", "app")}>
              <HotkeysProvider scope="ticket">{children}</HotkeysProvider>
            </ProjectContext.Provider>
          </RouterContextProvider>
        </RegistryContext.Provider>
      )
    }
  )
  expect(commentsRead(t1)).toBe(true)

  pressJ()
  wait(100)
  pressJ()
  wait(299)
  expect(result.current.shown).toBe(t3)
  expect(commentsRead(t2)).toBe(false)
  expect(commentsRead(t3)).toBe(false)

  wait(1)
  expect(commentsRead(t2)).toBe(false)
  expect(commentsRead(t3)).toBe(true)
})
