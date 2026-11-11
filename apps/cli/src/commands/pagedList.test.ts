import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { afterEach, expect, vi } from "vitest"

import { pagedList } from "./pagedList"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it.effect(
  "pages detailed history with actors, changes and referenced people",
  () =>
    Effect.gen(function* () {
      vi.stubEnv("PP_PAGER", "cat")
      const printed: Array<string> = []
      vi.spyOn(process.stdout, "write").mockImplementation((text) => {
        printed.push(String(text))
        return true
      })
      const cursors: Array<string | undefined> = []
      yield* pagedList(
        (cursor) =>
          Effect.sync(() => {
            cursors.push(cursor)
            return {
              items: [
                {
                  id: cursor === undefined ? "event-new" : "event-old",
                  actor: { name: "Ada" },
                  change: {
                    kind: "description_changed",
                    from: "Old description",
                    to: "New description"
                  }
                }
              ],
              people: [{ id: "u-2", name: "Grace" }],
              nextCursor: cursor === undefined ? "older" : null
            }
          }),
        "events",
        "details"
      )
      const text = printed.join("")
      expect(cursors).toEqual([undefined, "older"])
      for (const value of [
        "event-new",
        "event-old",
        "Ada",
        "description_changed",
        "Old description",
        "New description",
        "u-2",
        "Grace"
      ]) {
        expect(text).toContain(value)
      }
      expect(text).not.toContain("--cursor")
    })
)
