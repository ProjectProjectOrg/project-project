import { TagName } from "@pp/shared"
import { cleanup, renderHook } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { afterEach, expect, it, vi } from "vitest"

import { useApplyCreatedTag } from "./useApplyCreatedTag"

afterEach(cleanup)

it("applies a created tag without undoing edits made while creation was pending", () => {
  const tag = Schema.decodeSync(TagName)
  const onPatch = vi.fn<Parameters<typeof useApplyCreatedTag>[1]>()
  const { result, rerender } = renderHook(
    ({ tags }) => useApplyCreatedTag(tags, onPatch),
    { initialProps: { tags: [tag("removed")] } }
  )
  const finishCreation = result.current

  rerender({ tags: [tag("added")] })
  finishCreation(tag("created"))

  expect(onPatch).toHaveBeenLastCalledWith({
    tags: [tag("added"), tag("created")]
  })
})
