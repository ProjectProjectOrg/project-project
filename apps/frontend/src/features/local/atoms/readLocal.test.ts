import * as AsyncResult from "effect/reactivity/AsyncResult"
import { expect, it } from "vitest"

import { localValue } from "./readLocal"

it("a value from an open local stream is shown as settled", () => {
  const streamed = AsyncResult.success("rows", { waiting: true })

  expect(localValue(streamed)).toMatchObject({
    _tag: "Success",
    value: "rows",
    waiting: false
  })
})
