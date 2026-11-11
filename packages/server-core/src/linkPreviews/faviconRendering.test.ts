import { expect, it } from "vitest"

import { faviconRendering } from "./faviconRendering"

const svg = (content: string) =>
  new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${content}</svg>`
  )

it.each(["#24292e", "white"])(
  "recognizes a transparent %s symbol as monochrome",
  async (fill) => {
    expect(
      await faviconRendering(
        svg(`<circle cx="16" cy="16" r="12" fill="${fill}"/>`)
      )
    ).toBe("monochrome")
  }
)

it.each([1, 0.3])(
  "preserves colored details at opacity %s",
  async (opacity) => {
    expect(
      await faviconRendering(
        svg(
          `<rect x="16" y="4" width="12" height="24" fill="black"/><circle cx="6" cy="16" r="4" fill="#e53935" opacity="${opacity}"/>`
        )
      )
    ).toBe("original")
  }
)

it("preserves a black-and-white image with internal opaque details", async () => {
  expect(
    await faviconRendering(
      svg(
        '<circle cx="16" cy="16" r="12" fill="black"/><circle cx="16" cy="16" r="6" fill="white"/>'
      )
    )
  ).toBe("original")
})

it("preserves an icon with an opaque background", async () => {
  expect(
    await faviconRendering(svg('<rect width="32" height="32" fill="#24292e"/>'))
  ).toBe("original")
})

it("preserves an unreadable image", async () => {
  expect(await faviconRendering(new Uint8Array([1, 2, 3]))).toBe("original")
})
