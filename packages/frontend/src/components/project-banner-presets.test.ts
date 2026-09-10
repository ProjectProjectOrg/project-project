import { describe, expect, it } from "vite-plus/test"
import type { ProjectBanner } from "@projectproject/shared"
import { bannerPresets, bannerSource } from "./project-banner-presets"

describe("bannerSource", () => {
  it("returns null when there is no banner", () => {
    expect(bannerSource("acme", null)).toBeNull()
  })

  it("appends ?w=1024 to attachment-backed banners", () => {
    const banner = {
      type: "attachment",
      attachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    } as ProjectBanner
    expect(bannerSource("acme", banner)).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2?w=1024"
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
