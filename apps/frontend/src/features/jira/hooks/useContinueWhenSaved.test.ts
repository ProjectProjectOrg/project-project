// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useContinueWhenSaved } from "./useContinueWhenSaved"
import type { JiraImportDraftSave } from "./useJiraImportDraft"

afterEach(cleanup)

it("forgets a pending continue when the save it waited on fails", () => {
  const onContinue = vi.fn()
  const { result, rerender } = renderHook<
    ReturnType<typeof useContinueWhenSaved>,
    Pick<JiraImportDraftSave, "saving" | "failure">
  >((draft) => useContinueWhenSaved(draft, onContinue), {
    initialProps: { saving: true, failure: null }
  })
  act(() => result.current.request())
  rerender({ saving: false, failure: { message: "boom", remedy: null } })
  expect(result.current.pending).toBe(false)
  rerender({ saving: true, failure: null })
  rerender({ saving: false, failure: null })
  expect(onContinue).not.toHaveBeenCalled()
})
