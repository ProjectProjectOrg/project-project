import { describe, expect, it } from "vitest"

import { pagerCommand } from "./pager"

describe("pagerCommand", () => {
  it("pins the header only on a less that knows --header", () => {
    expect(pagerCommand({}, () => 668)).toEqual(["less", "--header=1"])
    expect(pagerCommand({}, () => 581)).toEqual(["less"])
  })

  it("uses PP_PAGER, then PAGER, and turns paging off for cat or nothing", () => {
    expect(pagerCommand({ PAGER: "more", PP_PAGER: "bat" })).toEqual([
      "sh",
      "-c",
      "bat"
    ])
    expect(pagerCommand({ PAGER: "cat" })).toBeUndefined()
    expect(pagerCommand({ PP_PAGER: "" })).toBeUndefined()
  })
})
