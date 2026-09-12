import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import * as Exit from "effect/Exit"

const uploadSpy = vi.fn()
const updateSpy = vi.fn()

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
  useAtomSet: (atom: string) =>
    atom === "upload-atom" ? uploadSpy : updateSpy,
  useAtomValue: () => ({ waiting: false })
}))
vi.mock("@/atoms/attachments", () => ({
  uploadProjectImageAtom: () => "upload-atom"
}))
vi.mock("@/atoms/projects", () => ({
  projectKey: (org: string, slug: string) => `${org}/${slug}`,
  updateProjectAtom: () => "update-atom"
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
vi.mock("@/lib/imageCompression", () => ({
  compressImage: vi.fn(() => Promise.reject(new Error("decode failed")))
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
  uploadSpy.mockClear()
  updateSpy.mockClear()
})

const stubEnvironment = () => {
  const bitmap = { width: 32, height: 32, close: () => {} }
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap)
  )
  URL.createObjectURL = vi.fn(() => "blob:mock")
  URL.revokeObjectURL = vi.fn()
  const fakeContext = {
    drawImage: () => {},
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

describe("ProjectIconUpload apply() decode failures", () => {
  it("surfaces the file-rejected error and skips uploading when compressImage fails to decode", async () => {
    stubEnvironment()
    uploadSpy.mockResolvedValue(Exit.succeed({ id: "attachment_1" }))
    updateSpy.mockResolvedValue(Exit.succeed(undefined))

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

    const applyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Apply"
    )
    expect(applyButton).toBeTruthy()

    await act(async () => {
      fireEvent.click(applyButton!)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(uploadSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("That file can't be used")
  })
})
