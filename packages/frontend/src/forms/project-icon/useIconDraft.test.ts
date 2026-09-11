import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { IconTreatment } from "@/lib/iconDraft"

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
