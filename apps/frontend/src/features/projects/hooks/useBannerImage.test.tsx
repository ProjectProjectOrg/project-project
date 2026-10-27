import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import {
  clearBannerRenderCache,
  prepareBannerRender,
  type BannerRenderKey
} from "@/features/projects/lib/bannerRenderCache"

import { useBannerImage, usePlaceholderSize } from "./useBannerImage"

const key: BannerRenderKey = {
  project: "acme/site",
  source: "/banner.webp",
  variant: "header",
  crop: { x: 0.5, y: 0.65, zoom: 1 },
  width: 1024,
  height: 160,
  pixelRatio: 1
}

type BannerImageProps = Readonly<{ cacheKey: BannerRenderKey | null }>

const stubImages = () => {
  let nextUrl = 0
  const decode = vi.fn<() => Promise<void>>(() => Promise.resolve())
  vi.stubGlobal(
    "Image",
    class {
      src = ""
      crossOrigin = ""
      naturalWidth = 1200
      naturalHeight = 400
      decode = decode
    }
  )
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = () => `blob:ready-banner-${++nextUrl}`
      static revokeObjectURL = vi.fn<(url: string) => void>()
    }
  )
  vi.stubGlobal("caches", undefined)
  return decode
}

afterEach(async () => {
  cleanup()
  await clearBannerRenderCache()
  vi.unstubAllGlobals()
})

it("shows a warm render before measuring and keeps it while rendering a resized replacement", async () => {
  const decode = stubImages()
  const lease = await prepareBannerRender(key, new Blob(["rendered"]))
  lease?.release()
  decode.mockClear()
  const initialProps: BannerImageProps = {
    cacheKey: null
  }

  const { result, rerender } = renderHook(
    ({ cacheKey }: BannerImageProps) =>
      useBannerImage(key.source, cacheKey, {
        identity: key,
        measured: cacheKey !== null,
        editing: false
      }),
    { initialProps }
  )

  expect(result.current.cachedRender).toBe("blob:ready-banner-1")
  expect(result.current.initiallyReady).toBe(true)
  expect(decode).not.toHaveBeenCalled()

  rerender({ cacheKey: { ...key, width: 1408 } })
  await waitFor(() => expect(result.current.shaderImage).not.toBeNull())

  expect(result.current.cachedRender).toBe("blob:ready-banner-1")
  expect(result.current.painted).toBe(false)
})

it("reuses thumbnail dimensions immediately on a return visit", async () => {
  const decode = stubImages()
  const { result, unmount } = renderHook(() => usePlaceholderSize("thumbnail"))
  expect(result.current).toBeNull()
  await waitFor(() =>
    expect(result.current).toEqual({ width: 1200, height: 400 })
  )
  unmount()
  decode.mockClear()

  const returned = renderHook(() => usePlaceholderSize("thumbnail"))
  expect(returned.result.current).toEqual({ width: 1200, height: 400 })
  expect(decode).not.toHaveBeenCalled()
})
