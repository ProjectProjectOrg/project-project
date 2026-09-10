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

describe("ProjectIconDisplay", () => {
  it("renders the emoji when there is no image", () => {
    render(
      <ProjectIconDisplay orgSlug="acme" icon="🌵" iconImage={null} size={40} />
    )
    expect(screen.queryByText("🌵")).not.toBeNull()
  })

  it("renders the rendered attachment for a sticker", () => {
    render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={sticker}
        size={40}
      />
    )
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M3"
    )
  })

  it("renders the source attachment for full_bleed", () => {
    render(
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
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2"
    )
  })

  it("falls back to the emoji when the image fails to load", () => {
    render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={sticker}
        size={40}
      />
    )
    fireEvent.error(screen.getByRole("img"))
    expect(screen.queryByText("🌵")).not.toBeNull()
    expect(screen.queryByRole("img")).toBeNull()
  })
})
