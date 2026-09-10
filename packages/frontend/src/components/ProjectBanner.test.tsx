import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useReducedMotion } from "motion/react"
import { ProjectBanner } from "./ProjectBanner"
import { bannerDefaults } from "./project-banner-presets"
import { bannerFadeMask } from "./project-banner-frame"

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }))
vi.mock("@/atoms/projects", () => ({
  projectBannerPreviewAtom: () => null,
  projectKey: (org: string, slug: string) => `${org}/${slug}`
}))
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>()
  return { ...actual, useReducedMotion: vi.fn(() => false) }
})

const cachedUrls = new Set<string>()
vi.mock("@/lib/imagePreload", () => ({
  isImageLoaded: (url: string) => cachedUrls.has(url)
}))

const photos: HTMLImageElement[] = []

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(useReducedMotion).mockReturnValue(false)
  photos.length = 0
  cachedUrls.clear()
})

it("keeps project content visible while the banner image is pending or fails", async () => {
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        photos.push(this as unknown as HTMLImageElement)
      }
      src = ""
      crossOrigin = ""
      onload: (() => void) | null = null
      decode = () => Promise.reject(new Error("Image unavailable"))
    }
  )
  const { container } = render(
    <>
      <ProjectBanner
        orgSlug="org"
        slug="project"
        banner={{
          type: "preset",
          preset: "sunset",
          crop: { x: 0.5, y: 0.5, zoom: 1 }
        }}
      />
      <h1>Project content</h1>
    </>
  )
  expect(screen.getByText("Project content")).toBeTruthy()
  expect(container.querySelector("canvas")).toBeNull()
  await act(async () => {
    photos[0].onload?.(new Event("load"))
  })
  expect(screen.getByText("Project content")).toBeTruthy()
  expect(container.querySelector("canvas")).toBeNull()
})

it("paints a blurred placeholder immediately on the card variant, sized for a small strip", () => {
  const { container } = render(
    <ProjectBanner
      orgSlug="org"
      slug="project"
      variant="card"
      banner={{
        type: "preset",
        preset: "sunset",
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      }}
    />
  )
  const img = container.querySelector("img")
  expect(img).not.toBeNull()
  expect(img?.style.filter).toBe("blur(6px)")
  expect(container.querySelector("canvas")).toBeNull()
  const maskWrapper = img?.parentElement
  const expectedStops = bannerFadeMask(bannerDefaults.fade).match(/[\d.]+%/g)
  expect(maskWrapper?.style.maskImage).toContain("linear-gradient")
  for (const stop of expectedStops ?? []) {
    expect(maskWrapper?.style.maskImage).toContain(stop)
  }
})

it("paints a blurred placeholder immediately on the row variant, sized for a tiny strip", () => {
  const { container } = render(
    <ProjectBanner
      orgSlug="org"
      slug="project"
      variant="row"
      banner={{
        type: "preset",
        preset: "sunset",
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      }}
    />
  )
  const img = container.querySelector("img")
  expect(img).not.toBeNull()
  expect(img?.style.filter).toBe("blur(3px)")
})

it("skips the blurred placeholder when the banner was already loaded this session", () => {
  cachedUrls.add("/api/attachments/org/test-attachment-id?w=1024")
  const { container } = render(
    <ProjectBanner
      orgSlug="org"
      slug="project"
      variant="card"
      banner={
        {
          type: "attachment",
          attachmentId: "test-attachment-id",
          crop: { x: 0.5, y: 0.5, zoom: 1 }
        } as never
      }
    />
  )
  expect(container.querySelector("img")).toBeNull()
})

it("skips the animated crossfade when reduced motion is preferred", () => {
  vi.mocked(useReducedMotion).mockReturnValue(true)
  const { container } = render(
    <ProjectBanner
      orgSlug="org"
      slug="project"
      variant="row"
      banner={{
        type: "preset",
        preset: "sunset",
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      }}
    />
  )
  const img = container.querySelector("img")
  expect(img).not.toBeNull()
  expect(img?.className).not.toContain("transition-opacity")
  expect(img?.style.transition).toBe("")
})

it("frames the placeholder using the banner's actual crop once sizes are known", async () => {
  let resizeCallback: ResizeObserverCallback | null = null
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        photos.push(this as unknown as HTMLImageElement)
      }
      src = ""
      crossOrigin = ""
      naturalWidth = 3000
      naturalHeight = 1000
      onload: (() => void) | null = null
      decode = () => Promise.reject(new Error("skip shader"))
    }
  )
  const { container } = render(
    <ProjectBanner
      orgSlug="org"
      slug="project"
      variant="row"
      banner={{
        type: "preset",
        preset: "sunset",
        crop: { x: 1, y: 1, zoom: 2 }
      }}
    />
  )
  await act(async () => {
    photos[0].onload?.(new Event("load"))
  })
  await act(async () => {
    resizeCallback?.(
      [
        {
          contentRect: { width: 900, height: 300 }
        } as ResizeObserverEntry
      ],
      {} as ResizeObserver
    )
  })
  const img = container.querySelector("img")
  expect(img?.style.width).toBe("200%")
  expect(img?.style.height).toBe("200%")
  expect(img?.style.left).toBe("-100%")
  expect(img?.style.top).toBe("-100%")
})
