import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { IconTreatment } from "@/lib/iconDraft"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const built = vi.hoisted(() => ({ calls: 0 }))

vi.mock("@/lib/iconDraft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/iconDraft")>()
  return {
    ...actual,
    buildDraftPreview: vi.fn(
      async (
        _bitmap: ImageBitmap,
        requested: IconTreatment,
        tolerance: number
      ) => {
        built.calls += 1
        return {
          cutoutUrl: `blob:cutout-${tolerance}`,
          fullUrl: `blob:full-${tolerance}`,
          clean: true,
          transparent: false,
          treatment: requested
        }
      }
    )
  }
})

import { useIconDraft } from "./useIconDraft"

const TOLERANCE = 24

beforeEach(() => {
  built.calls = 0
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => {} }))
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:source",
    revokeObjectURL: () => undefined
  })
})

afterEach(() => vi.unstubAllGlobals())

const pngFile = () => new File(["x"], "icon.png", { type: "image/png" })

const acceptedDraft = async () => {
  const { result } = renderHook(() => useIconDraft())
  await act(async () => {
    await result.current.accept(pngFile(), {
      treatment: "sticker",
      tolerance: TOLERANCE
    })
  })
  return result
}

it("keeps both renders so each choice can show its own result", async () => {
  const result = await acceptedDraft()

  expect(result.current.preview?.cutoutUrl).toBe(`blob:cutout-${TOLERANCE}`)
  expect(result.current.preview?.fullUrl).toBe(`blob:full-${TOLERANCE}`)
})

it("switches treatment without rebuilding the renders", async () => {
  const result = await acceptedDraft()
  expect(built.calls).toBe(1)

  await act(async () => {
    await result.current.restyle("full_bleed", TOLERANCE)
  })

  expect(built.calls).toBe(1)
  expect(result.current.preview?.treatment).toBe("full_bleed")
  expect(result.current.preview?.cutoutUrl).toBe(`blob:cutout-${TOLERANCE}`)
  expect(result.current.preview?.fullUrl).toBe(`blob:full-${TOLERANCE}`)
})

it("rebuilds the renders when the tolerance moves", async () => {
  const result = await acceptedDraft()

  await act(async () => {
    await result.current.restyle("sticker", TOLERANCE + 10)
  })

  expect(built.calls).toBe(2)
  expect(result.current.preview?.cutoutUrl).toBe(
    `blob:cutout-${TOLERANCE + 10}`
  )
})

it("discards an older tolerance render when returning to the cached tolerance", async () => {
  const { buildDraftPreview } = await import("@/lib/iconDraft")
  const result = await acceptedDraft()
  const pending = deferred<Awaited<ReturnType<typeof buildDraftPreview>>>()
  vi.mocked(buildDraftPreview).mockReturnValueOnce(pending.promise)
  let restyling: Promise<void>
  act(() => {
    restyling = result.current.restyle("sticker", TOLERANCE + 10)
  })
  await act(async () => {
    await result.current.restyle("full_bleed", TOLERANCE)
    pending.resolve({
      cutoutUrl: "blob:stale-cutout",
      fullUrl: "blob:stale-full",
      clean: true,
      reason: null,
      transparent: false,
      treatment: "sticker"
    })
    await restyling
  })
  expect(result.current.preview?.treatment).toBe("full_bleed")
  expect(result.current.preview?.fullUrl).toBe(`blob:full-${TOLERANCE}`)
})

it("closes a bitmap decoded after the editor unmounts", async () => {
  const close = vi.fn()
  const bitmap = { close } as unknown as ImageBitmap
  const pending = deferred<ImageBitmap>()
  vi.stubGlobal("createImageBitmap", () => pending.promise)
  const { result, unmount } = renderHook(() => useIconDraft())
  const accepting = result.current.accept(pngFile())
  unmount()
  pending.resolve(bitmap)
  expect(await accepting).toBeNull()
  expect(close).toHaveBeenCalledOnce()
})

it("revokes preview URLs produced after the editor unmounts", async () => {
  const { buildDraftPreview } = await import("@/lib/iconDraft")
  const pending = deferred<Awaited<ReturnType<typeof buildDraftPreview>>>()
  vi.mocked(buildDraftPreview).mockReturnValueOnce(pending.promise)
  const revoke = vi.fn()
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:source",
    revokeObjectURL: revoke
  })
  const { result, unmount } = renderHook(() => useIconDraft())
  let accepting: Promise<string | null>
  await act(async () => {
    accepting = result.current.accept(pngFile())
    await Promise.resolve()
  })
  unmount()
  pending.resolve({
    cutoutUrl: "blob:late-cutout",
    fullUrl: "blob:late-full",
    clean: true,
    reason: null,
    transparent: false,
    treatment: "sticker"
  })
  expect(await accepting!).toBeNull()
  expect(revoke).toHaveBeenCalledWith("blob:late-cutout")
  expect(revoke).toHaveBeenCalledWith("blob:late-full")
})
