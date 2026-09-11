import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
})

vi.mock("@effect/atom-react", () => ({
  useAtomSet: () => async () => ({}),
  useAtomValue: () => ({ waiting: false })
}))
vi.mock("@/atoms/attachments", () => ({
  uploadProjectImageAtom: () => "atom"
}))
vi.mock("@/atoms/projects", () => ({
  projectKey: (org: string, slug: string) => `${org}/${slug}`,
  updateProjectAtom: () => "atom"
}))
vi.mock("@/atoms/storage", () => ({
  orgStorageAtom: () => "atom"
}))
vi.mock("@/lib/iconCutout", () => ({
  analyzeCutout: () => ({
    alpha: new Uint8ClampedArray(4),
    checks: [],
    clean: true
  }),
  hasAlpha: () => false,
  CUTOUT_DEFAULT_TOLERANCE: 24,
  CUTOUT_MAX_TOLERANCE: 160,
  CUTOUT_PREVIEW_EDGE: 256
}))
vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    value,
    onChange,
    label
  }: {
    value: number
    onChange: (value: number) => void
    label?: string
  }) => (
    <input
      aria-label={label}
      type="range"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}))

import { ProjectIconUpload } from "./ProjectIconUpload"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  scheduledFrames.length = 0
})

let scheduledFrames: FrameRequestCallback[] = []

const stubEnvironment = () => {
  let closed = false
  const bitmap = {
    width: 32,
    height: 32,
    close: () => {
      closed = true
    }
  }
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap)
  )
  URL.createObjectURL = vi.fn(() => "blob:mock")
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    scheduledFrames.push(cb)
    return scheduledFrames.length
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  const fakeContext = {
    drawImage: () => {
      if (closed)
        throw new Error("cannot draw a closed ImageBitmap onto a canvas")
    },
    getImageData: () => ({
      data: new Uint8ClampedArray(32 * 32 * 4),
      width: 32,
      height: 32
    }),
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height
    }),
    putImageData: () => {}
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    fakeContext as unknown as CanvasRenderingContext2D
  )
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: BlobCallback) => callback(new Blob())
  )
  return { bitmap }
}

it("does not throw when the tolerance drag's pending frame fires after Cancel closes the draft", async () => {
  stubEnvironment()
  const { container } = render(
    <ProjectIconUpload orgSlug="org" slug="proj" iconImage={null} />
  )

  const fileInput = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement
  const file = new File(["x"], "icon.png", { type: "image/png" })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })

  const slider = container.querySelector(
    "input[type='range']"
  ) as HTMLInputElement
  expect(slider).not.toBeNull()

  fireEvent.change(slider, { target: { value: "40" } })
  expect(scheduledFrames).toHaveLength(1)
  const pendingFrame = scheduledFrames[0]

  const cancelButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Cancel")
  )
  fireEvent.click(cancelButton!)

  const unhandled: unknown[] = []
  const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
  const nodeProcess = (
    globalThis as unknown as {
      process: {
        on: (event: string, listener: (reason: unknown) => void) => void
        off: (event: string, listener: (reason: unknown) => void) => void
      }
    }
  ).process
  nodeProcess.on("unhandledRejection", onUnhandledRejection)
  try {
    await act(async () => {
      pendingFrame(0)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    await Promise.resolve()
  } finally {
    nodeProcess.off("unhandledRejection", onUnhandledRejection)
  }

  expect(unhandled).toEqual([])
})
