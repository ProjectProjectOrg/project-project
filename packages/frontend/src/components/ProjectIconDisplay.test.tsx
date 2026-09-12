import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"
import type { ProjectIconImage } from "@projectproject/shared"
import { ProjectIconDisplay } from "./ProjectIconDisplay"

afterEach(cleanup)

const sticker = {
  type: "sticker" as const,
  sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
  renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
  cutoutTolerance: 24,
  crop: { x: 0.5, y: 0.5, zoom: 1 }
} as ProjectIconImage

const otherSticker = {
  ...sticker,
  renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M9"
} as ProjectIconImage

describe("ProjectIconDisplay", () => {
  it("renders the emoji when there is no image", () => {
    render(
      <ProjectIconDisplay orgSlug="acme" icon="🌵" iconImage={null} size={40} />
    )
    expect(screen.queryByText("🌵")).not.toBeNull()
  })

  it("renders the rendered attachment for a sticker", () => {
    const { container } = render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={sticker}
        size={40}
      />
    )
    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M3?w=64"
    )
  })

  it("honours crop zoom and position for a sticker", () => {
    const { container } = render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={
          {
            ...sticker,
            crop: { x: 0.25, y: 0.75, zoom: 2 }
          } as ProjectIconImage
        }
        size={40}
      />
    )
    const img = container.querySelector("img")
    expect(img?.style.objectPosition).toBe("25% 75%")
    expect(img?.style.scale).toBe("2")
  })

  it("renders the source attachment for full_bleed", () => {
    const { container } = render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={
          {
            type: "full_bleed",
            sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
            crop: { x: 0.5, y: 0.5, zoom: 1 }
          } as ProjectIconImage
        }
        size={40}
      />
    )
    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2?w=64"
    )
  })

  it("falls back to the emoji when the image fails to load", () => {
    const { container } = render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={sticker}
        size={40}
      />
    )
    const img = container.querySelector("img")
    fireEvent.error(img!)
    expect(screen.queryByText("🌵")).not.toBeNull()
    expect(container.querySelector("img")).toBeNull()
  })

  it("resets the failed state once the resolved attachment id changes", () => {
    const { container, rerender } = render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={sticker}
        size={40}
      />
    )
    const img = container.querySelector("img")
    fireEvent.error(img!)
    expect(screen.queryByText("🌵")).not.toBeNull()

    rerender(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={otherSticker}
        size={40}
      />
    )
    const nextImg = container.querySelector("img")
    expect(nextImg?.getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M9?w=64"
    )
  })
})
