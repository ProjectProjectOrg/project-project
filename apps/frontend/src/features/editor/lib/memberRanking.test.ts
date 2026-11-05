import { describe, expect, it } from "vitest"

import { rankMembers } from "./memberRanking"

const member = (id: string, name: string, username: string | null = null) => ({
  id,
  name,
  username,
  email: `${id}@example.com`
})

const members = [
  member("anna", "Anna de Luuk"),
  member("bas", "Bas Jansen", "luukie"),
  member("luuk", "Luuk Munneke", "luuk"),
  member("wouter", "Wouter van Hoof", "wvh")
]

const ids = (query: string, involved?: ReadonlyArray<string>) =>
  rankMembers(members, query, involved).map((m) => m.id)

describe("rankMembers", () => {
  it("puts involved people first when nothing is typed", () => {
    expect(ids("", ["wouter"])).toEqual(["wouter", "anna", "bas", "luuk"])
  })

  it("ranks exact, then prefix, then word, then substring matches", () => {
    expect(ids("luuk")).toEqual(["luuk", "bas", "anna"])
    expect(ids("uuk")).toEqual(["anna", "bas", "luuk"])
  })

  it("matches full names with spaces", () => {
    expect(ids("luuk  munn")).toEqual(["luuk"])
  })

  it("breaks ties in favour of involved people", () => {
    expect(ids("an", ["wouter"])).toEqual(["anna", "wouter", "bas"])
    expect(ids("example", ["luuk"])).toEqual(["luuk", "anna", "bas", "wouter"])
  })
})
