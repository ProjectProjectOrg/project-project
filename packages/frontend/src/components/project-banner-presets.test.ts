import { describe, expect, it } from "vite-plus/test"
import type { ProjectBanner } from "@projectproject/shared"
import { bannerPresets, bannerSource } from "./project-banner-presets"

describe("bannerSource", () => {
  it("returns null when there is no banner", () => {
    expect(bannerSource("acme", null)).toBeNull()
  })

  it("snaps a requested css width up to a ladder rung", () => {
    const banner = {
      type: "attachment",
      attachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    } as ProjectBanner
    expect(bannerSource("acme", banner, 900)).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2?w=1024"
    )
  })

  it("reaches the 2560 rung a compressed banner is stored at", () => {
    const banner = {
      type: "attachment",
      attachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    } as ProjectBanner
    expect(bannerSource("acme", banner, 2400)).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2?w=2560"
    )
  })

  it("leaves the url bare when no width is requested", () => {
    const banner = {
      type: "attachment",
      attachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    } as ProjectBanner
    expect(bannerSource("acme", banner)).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2"
    )
  })

  it("does not add a width param to preset banners", () => {
    const banner = {
      type: "preset",
      preset: "sunset",
      crop: { x: 0.5, y: 0.65, zoom: 1 }
    } as ProjectBanner
    expect(bannerSource("acme", banner)).toBe(bannerPresets[0].src)
    expect(bannerSource("acme", banner)).not.toContain("?")
  })
})
