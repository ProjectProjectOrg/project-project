import { describe, expect, it } from "vitest"

import { parsePageMetadata } from "./pageMetadata"

const page = new URL("https://example.com/docs/guide")

describe("parsePageMetadata", () => {
  it("prefers og:title over the document title", () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta content="Open &amp; Graph" property="og:title">
    </head></html>`
    expect(parsePageMetadata(html, page).title).toBe("Open & Graph")
  })

  it("decodes entities and collapses whitespace in the document title", () => {
    const html = `<head><title>
      Tom &#38; Jerry&nbsp;&mdash; &#x1F600;
    </title></head>`
    expect(parsePageMetadata(html, page).title).toBe("Tom & Jerry — 😀")
  })

  it("ignores titles inside scripts, comments and the body", () => {
    const html = `<head>
      <script>document.write("<title>Script</title>")</script>
      <!-- <title>Comment</title> -->
    </head><body><title>Body</title></body>`
    expect(parsePageMetadata(html, page).title).toBeNull()
  })

  it("resolves the icon closest to 32px against the base href", () => {
    const html = `<head>
      <base href="https://cdn.example.com/assets/">
      <link rel="icon" sizes="16x16" href="icon-16.png">
      <link rel="shortcut icon" sizes="32x32" href="icon-32.png">
      <link rel="icon" sizes="192x192" href="icon-192.png">
    </head>`
    expect(parsePageMetadata(html, page).faviconUrl).toBe(
      "https://cdn.example.com/assets/icon-32.png"
    )
  })

  it("prefers a scalable icon and falls back to the apple touch icon", () => {
    const scalable = `<head>
      <link rel="icon" sizes="32x32" href="/icon-32.png">
      <link rel="icon" type="image/svg+xml" href="/icon.svg">
    </head>`
    expect(parsePageMetadata(scalable, page).faviconUrl).toBe(
      "https://example.com/icon.svg"
    )
    const touchOnly = `<head><link rel=apple-touch-icon href=/touch.png></head>`
    expect(parsePageMetadata(touchOnly, page).faviconUrl).toBe(
      "https://example.com/touch.png"
    )
  })

  it("falls back to /favicon.ico and skips non-http icons", () => {
    const html = `<head><link rel="icon" href="data:image/png;base64,AAAA"></head>`
    expect(parsePageMetadata(html, page)).toEqual({
      title: null,
      faviconUrl: "https://example.com/favicon.ico"
    })
  })
})
