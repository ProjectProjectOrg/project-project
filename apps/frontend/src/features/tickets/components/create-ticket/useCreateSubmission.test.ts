// @vitest-environment jsdom
import { TicketId } from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Exit from "effect/Exit"
import { afterEach, expect, it, vi } from "vitest"

import { useCreateSubmission } from "./useCreateSubmission"

afterEach(cleanup)

it("locks the form once the ticket exists, so a resubmit only retries the link", async () => {
  const id = TicketId.make("T-7")
  const create = vi.fn<() => Promise<Exit.Exit<TicketId, unknown>>>(async () =>
    Exit.succeed(id)
  )
  const link = vi
    .fn<(target: TicketId) => Promise<Exit.Exit<unknown, unknown>>>()
    .mockResolvedValueOnce(Exit.fail("offline"))
    .mockResolvedValueOnce(Exit.void)
  const done = vi.fn<(target: TicketId) => void>()
  const { result } = renderHook(() =>
    useCreateSubmission({ create, link, done })
  )

  await act(() => result.current.submit())
  expect(result.current.submission).toMatchObject({ _tag: "linkFailed", id })
  expect(result.current.locked).toBe(true)
  expect(done).not.toHaveBeenCalled()

  await act(() => result.current.submit())
  expect(create).toHaveBeenCalledTimes(1)
  expect(link).toHaveBeenNthCalledWith(2, id)
  expect(done).toHaveBeenCalledWith(id)
})
