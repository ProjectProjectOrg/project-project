import { act, renderHook } from "@testing-library/react"
import * as Exit from "effect/Exit"
import { expect, it, vi } from "vitest"

import type { DescriptionHandle } from "./DescriptionField"
import { useTemplateSwap, type TypePatch } from "./useTemplateSwap"

const PREVIOUS = "old body"
const SWAPPED = "new body"

const fakeDescription = () => {
  let body = PREVIOUS
  let onEdit: (() => void) | null = null
  const handle: DescriptionHandle = {
    swapTemplate: () => {
      body = SWAPPED
      return { name: "Bug report", previous: PREVIOUS, swapped: SWAPPED }
    },
    restore: vi.fn((markdown: string) => {
      body = markdown
    }),
    matches: (markdown) => body === markdown,
    onEdit: (_markdown, callback) => {
      onEdit = callback
      return () => {
        onEdit = null
      }
    }
  }
  const type = (text: string) => {
    body = text
    onEdit?.()
  }
  return { handle, type }
}

const setup = (onPatch: TypePatch) => {
  const description = fakeDescription()
  const hook = renderHook(() => useTemplateSwap("feat", onPatch))
  hook.result.current.descriptionRef.current = description.handle
  return { ...description, hook }
}

it("dismisses the note once the swapped body is edited", async () => {
  const { hook, type } = setup(async () => Exit.succeed(undefined))
  await act(async () => hook.result.current.onTypePatch({ type: "bug" }))
  expect(hook.result.current.note?.name).toBe("Bug report")
  act(() => type("new body, and my notes"))
  expect(hook.result.current.note).toBeNull()
})

it("rolls the body back when the type change fails", async () => {
  const { hook, handle } = setup(async () => Exit.fail("boom"))
  await act(async () => hook.result.current.onTypePatch({ type: "bug" }))
  expect(handle.restore).toHaveBeenCalledWith(PREVIOUS)
  expect(hook.result.current.note).toBeNull()
})

it("keeps what the user typed when the type change fails later", async () => {
  let settle: (exit: Exit.Exit<unknown, unknown>) => void = () => {}
  const { hook, handle, type } = setup(
    () =>
      new Promise((resolve) => {
        settle = resolve
      })
  )
  act(() => hook.result.current.onTypePatch({ type: "bug" }))
  act(() => type("my notes"))
  await act(async () => settle(Exit.fail("boom")))
  expect(handle.restore).not.toHaveBeenCalled()
})

it("undo restores the previous body while it is untouched", async () => {
  const { hook, handle } = setup(async () => Exit.succeed(undefined))
  await act(async () => hook.result.current.onTypePatch({ type: "bug" }))
  act(() => hook.result.current.undo())
  expect(handle.restore).toHaveBeenCalledWith(PREVIOUS)
  expect(hook.result.current.note).toBeNull()
})
