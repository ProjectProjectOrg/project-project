import { describe, expect, it } from "vitest"

import { isBareUrlLabel, previewableUrl } from "./linkPreviewUrl"

describe("previewableUrl", () => {
  it.each([
    ["https://github.com/org/repo#readme", "https://github.com/org/repo"],
    ["http://example.com", "http://example.com/"]
  ])("previews %s as %s", (href, url) => {
    expect(previewableUrl(href)).toBe(url)
  })

  it.each([
    "mention:ticket/T-1",
    "/api/attachments/acme/01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "mailto:someone@example.com",
    "#heading",
    undefined
  ])("skips %s", (href) => {
    expect(previewableUrl(href)).toBeNull()
  })
})

describe("isBareUrlLabel", () => {
  it.each([
    ["https://github.com/org/repo", "https://github.com/org/repo"],
    ["github.com/org/repo", "https://github.com/org/repo/"],
    ["www.example.com", "http://www.example.com"]
  ])("treats %s as the bare form of %s", (label, href) => {
    expect(isBareUrlLabel(label, href)).toBe(true)
  })

  it("keeps a label someone wrote", () => {
    expect(isBareUrlLabel("the repo", "https://github.com/org/repo")).toBe(
      false
    )
  })
})
