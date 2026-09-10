import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { BANNER_PLACEHOLDER_BUDGET } from "@projectproject/shared"
import {
  BANNER_PLACEHOLDER_EDGE,
  compressBanner,
  compressImage
} from "./imageCompression"

interface FakeBitmap {
  width: number
  height: number
  close: () => void
}

const stubBitmap = (width: number, height: number): FakeBitmap => ({
  width,
  height,
  close: vi.fn()
})

const stubCanvas = (
  drawImage: (...args: Array<unknown>) => void,
  blob: Blob | null
) => {
  const originalCreateElement = document.createElement.bind(document)
  return vi
    .spyOn(document, "createElement")
    .mockImplementation((tag: string) => {
      const element = originalCreateElement(tag) as HTMLCanvasElement
      if (tag !== "canvas") return element
      Object.defineProperty(element, "getContext", {
        value: () => ({ drawImage })
      })
      Object.defineProperty(element, "toBlob", {
        value: (
          callback: (blob: Blob | null) => void,
          _type?: string,
          _quality?: number
        ) => callback(blob)
      })
      return element
    })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("compressImage", () => {
  it("never upscales an image smaller than maxEdge", async () => {
    const bitmap = stubBitmap(100, 50)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    const drawImage = vi.fn()
    stubCanvas(drawImage, new Blob([new Uint8Array(1)], { type: "image/webp" }))

    const file = new File([new Uint8Array(4096)], "photo.jpg", {
      type: "image/jpeg"
    })
    await compressImage(file, { maxEdge: 2560, hasAlpha: false })

    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 100, 50)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it("returns the original file when the re-encoded blob is larger", async () => {
    const bitmap = stubBitmap(200, 200)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    stubCanvas(vi.fn(), new Blob([new Uint8Array(2000)]))

    const file = new File([new Uint8Array(10)], "small.png", {
      type: "image/png"
    })
    const result = await compressImage(file, { maxEdge: 512, hasAlpha: false })

    expect(result).toBe(file)
  })

  it("picks a lossless encode when the source has alpha", async () => {
    const bitmap = stubBitmap(200, 200)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    stubCanvas(vi.fn(), new Blob([new Uint8Array(10)], { type: "image/png" }))

    const file = new File([new Uint8Array(1000)], "logo.png", {
      type: "image/png"
    })
    const result = await compressImage(file, { maxEdge: 1024, hasAlpha: true })

    expect(result.type).toBe("image/png")
    expect(result).not.toBe(file)
  })

  it("scales the longest edge down to maxEdge while preserving aspect ratio", async () => {
    const bitmap = stubBitmap(4000, 2000)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    const drawImage = vi.fn()
    stubCanvas(drawImage, new Blob([new Uint8Array(1)], { type: "image/webp" }))

    const file = new File([new Uint8Array(999999)], "big.jpg", {
      type: "image/jpeg"
    })
    await compressImage(file, { maxEdge: 2000, hasAlpha: false })

    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2000, 1000)
  })

  it("passes the lossy type and quality through to toBlob when there is no alpha", async () => {
    const bitmap = stubBitmap(200, 200)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    const originalCreateElement = document.createElement.bind(document)
    const toBlob = vi.fn(
      (
        callback: (blob: Blob | null) => void,
        _type?: string,
        _quality?: number
      ) => callback(new Blob([new Uint8Array(1)], { type: "image/webp" }))
    )
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreateElement(tag) as HTMLCanvasElement
      if (tag !== "canvas") return element
      Object.defineProperty(element, "getContext", {
        value: () => ({ drawImage: vi.fn() })
      })
      Object.defineProperty(element, "toBlob", { value: toBlob })
      return element
    })

    const file = new File([new Uint8Array(1000)], "photo.jpg", {
      type: "image/jpeg"
    })
    await compressImage(file, { maxEdge: 1024, hasAlpha: false, quality: 0.7 })

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.7)
  })

  it("propagates a decode failure as a rejection", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.reject(new Error("corrupt image")))
    )

    const file = new File([new Uint8Array(4)], "broken.png", {
      type: "image/png"
    })

    await expect(
      compressImage(file, { maxEdge: 1024, hasAlpha: false })
    ).rejects.toThrow("corrupt image")
  })
})

describe("compressBanner", () => {
  it("draws the placeholder from the same bitmap, capped at 24px on the long edge", async () => {
    const bitmap = stubBitmap(2000, 1000)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    const drawImage = vi.fn()
    stubCanvas(
      drawImage,
      new Blob([new Uint8Array(64)], { type: "image/webp" })
    )

    const file = new File([new Uint8Array(999999)], "banner.jpg", {
      type: "image/jpeg"
    })
    const result = await compressBanner(file, {
      maxEdge: 2560,
      hasAlpha: false,
      quality: 0.82
    })

    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2000, 1000)
    expect(drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
      BANNER_PLACEHOLDER_EDGE,
      12
    )
    expect(result.placeholder?.startsWith("data:image/webp;base64,")).toBe(true)
    expect(result.placeholder!.length).toBeLessThanOrEqual(
      BANNER_PLACEHOLDER_BUDGET
    )
  })

  it("returns a null placeholder when the canvas cannot encode webp", async () => {
    const bitmap = stubBitmap(200, 100)
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap))
    )
    stubCanvas(vi.fn(), new Blob([new Uint8Array(8)], { type: "image/png" }))

    const file = new File([new Uint8Array(4096)], "banner.jpg", {
      type: "image/jpeg"
    })
    const result = await compressBanner(file, {
      maxEdge: 2560,
      hasAlpha: false
    })

    expect(result.placeholder).toBeNull()
    expect(result.file.name).toBe("banner.webp")
  })
})
