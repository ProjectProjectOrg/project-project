import { describe, expect, it } from "vitest"

import { toReplaceUrlInput } from "../replace-url/opts"
import { toReplaceHeadersInput } from "./opts"

describe("toReplaceHeadersInput", () => {
  it("sends only filled headers, and an empty list to remove them all", () => {
    expect(
      toReplaceHeadersInput({
        headers: [
          { name: " X-Token ", value: "abc" },
          { name: "", value: "" }
        ]
      })
    ).toEqual({ headers: [{ name: "X-Token", value: "abc" }] })
    expect(toReplaceHeadersInput({ headers: [] })).toEqual({ headers: [] })
  })
})

describe("toReplaceUrlInput", () => {
  it("trims the URL", () => {
    expect(toReplaceUrlInput({ url: " https://hooks.example.com " })).toEqual({
      url: "https://hooks.example.com"
    })
  })
})
