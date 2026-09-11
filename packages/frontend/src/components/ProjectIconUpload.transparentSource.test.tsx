import { act, cleanup, fireEvent, render } from "@testing-library/react"
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
  hasAlpha: () => true,
  CUTOUT_DEFAULT_TOLERANCE: 24,
  CUTOUT_MAX_TOLERANCE: 160,
  CUTOUT_PREVIEW_EDGE: 256
}))
vi.mock("@/lib/imageCompression", () => ({
  compressImage: vi.fn(async (file: File) => file)
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
}

describe("ProjectIconUpload transparent-source passthrough", () => {
  it("composites a transparent source at the apply cap instead of passing the original through", async () => {
    stubEnvironment()
    uploadSpy.mockResolvedValue(Exit.succeed({ id: "attachment_1" }))
    updateSpy.mockResolvedValue(Exit.succeed(undefined))

    const { container } = render(
      <ProjectIconUpload orgSlug="org" slug="proj" iconImage={null} />
    )

    const fileInput = container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement
    const bytes = new Uint8Array([1, 2, 3, 4])
    const file = new File([bytes], "photo.webp", { type: "image/webp" })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const applyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Apply"
    )
    await act(async () => {
      fireEvent.click(applyButton!)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(uploadSpy).toHaveBeenCalledTimes(2)
    const renderedUpload = uploadSpy.mock.calls[1][0] as { file: File }
    expect(renderedUpload.file.type).toBe("image/png")
    expect(renderedUpload.file.name).toBe("icon.png")
    const uploadedBytes = new Uint8Array(
      await renderedUpload.file.arrayBuffer()
    )
    expect(Array.from(uploadedBytes)).not.toEqual(Array.from(bytes))
  })
})
