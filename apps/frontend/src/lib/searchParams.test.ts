import * as DateTime from "effect/DateTime"
import { expect, it } from "vitest"

import { parseSearch, stringifySearch } from "./searchParams"

it("uses standard repeated parameters without interpreting values", () => {
  const search = {
    type: ["bug", "chore"],
    assignee: ["user,one", "a+b & = ü%2C"],
    tags: ["123"],
    q: '"true"',
    redirect: "/tickets?type=bug&type=chore"
  }
  const url = stringifySearch(search)
  expect(url).toContain("type=bug&type=chore")
  expect(parseSearch(url)).toEqual({ ...search, tags: "123" })
})

it("omits absent and empty arrays and leaves scalar types to route schemas", () => {
  expect(stringifySearch({ tags: [], q: undefined })).toBe("")
  expect(parseSearch("?focusBody=1&hasPr=false&type=bug")).toEqual({
    focusBody: "1",
    hasPr: "false",
    type: "bug"
  })
})

it.each([
  { sort: { key: "created", dir: "desc" } },
  { updatedAfter: DateTime.toDate(DateTime.makeUnsafe("2026-11-01")) }
])("rejects values outside the flat search contract", (search) => {
  expect(() => stringifySearch(search)).toThrow()
})
