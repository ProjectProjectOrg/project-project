import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ProjectIconImage } from "@projectproject/shared"

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const mocks = vi.hoisted(() => ({
  update: vi.fn(async () => ({ _tag: "Success" })),
  upload: vi.fn(async () => ({ _tag: "Success", value: { id: "att_1" } })),
  compress: vi.fn(),
  rejected: vi.fn(),
  bitmap: vi.fn(),
  file: vi.fn()
}))
vi.mock("@effect/atom-react", () => ({
  useAtomSet: (atom: string) =>
    atom === "upload" ? mocks.upload : mocks.update,
  useAtomValue: () => ({ waiting: false })
}))
vi.mock("@/atoms/attachments", () => ({
  uploadProjectImageAtom: () => "upload"
}))
vi.mock("@/atoms/projects", () => ({
  projectKey: () => "org/proj",
  updateProjectAtom: () => "update"
}))
vi.mock("@/lib/imageCompression", () => ({ compressImage: mocks.compress }))
vi.mock("./useIconDraft", () => ({
  draftPreviewUrl: () => null,
  useIconDraft: () => ({
    preview: null,
    rejected: false,
    setRejected: mocks.rejected,
    bitmap: mocks.bitmap,
    file: mocks.file,
    fileName: () => null,
    primeFrom: async () => {},
    markUnclean: () => {}
  })
}))
vi.mock("@/lib/iconDraft", async (original) => ({
  ...(await original<typeof import("@/lib/iconDraft")>()),
  analyseAt: () => ({
    source: {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255])
    },
    alpha: null,
    clean: true
  })
}))
vi.mock("./crop-step", () => ({
  CropStep: ({ onAdvance }: { onAdvance: () => void }) => (
    <button onClick={onAdvance}>Continue</button>
  )
}))
vi.mock("./source-step", () => ({ SourceStep: () => null }))
vi.mock("./treatment-step", () => ({
  TreatmentStep: ({
    form,
    onRemove
  }: {
    form: { handleSubmit: () => Promise<void> }
    onRemove: () => void
  }) => (
    <>
      <button onClick={() => void form.handleSubmit()}>Apply</button>
      <button onClick={onRemove}>Remove</button>
    </>
  )
}))

import { ProjectIconForm } from "./index"

const iconImage = {
  type: "full_bleed",
  sourceAttachmentId: "att_1",
  crop: { x: 0.5, y: 0.5, zoom: 1 }
} as ProjectIconImage
const renderForm = (onDone = vi.fn()) =>
  render(
    <ProjectIconForm
      orgSlug="org"
      slug="proj"
      icon="🎨"
      iconImage={iconImage}
      accent="red"
      onDone={onDone}
    />
  )

beforeEach(() => {
  mocks.bitmap.mockReturnValue(null)
  mocks.file.mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it("keeps the editor open when removing an image fails", async () => {
  mocks.update.mockResolvedValueOnce({ _tag: "Failure" })
  const onDone = vi.fn()
  renderForm(onDone)
  fireEvent.click(screen.getByText("Continue"))
  fireEvent.click(await screen.findByText("Remove"))
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith({ iconImage: null })
  )
  expect(onDone).not.toHaveBeenCalled()
})

it("does not upload after cancellation during compression", async () => {
  const pending = deferred<File>()
  mocks.bitmap.mockReturnValue({})
  mocks.file.mockReturnValue(
    new File(["x"], "image.png", { type: "image/png" })
  )
  mocks.compress.mockReturnValueOnce(pending.promise)
  const { unmount } = renderForm()
  fireEvent.click(screen.getByText("Continue"))
  fireEvent.click(await screen.findByText("Apply"))
  await waitFor(() => expect(mocks.compress).toHaveBeenCalledOnce())
  unmount()
  pending.resolve(new File(["x"], "compressed.webp", { type: "image/webp" }))
  await pending.promise
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it("surfaces compression failures instead of rejecting the submission", async () => {
  mocks.bitmap.mockReturnValue({})
  mocks.file.mockReturnValue(
    new File(["x"], "image.png", { type: "image/png" })
  )
  mocks.compress.mockRejectedValueOnce(new Error("encode failed"))
  renderForm()
  fireEvent.click(screen.getByText("Continue"))
  fireEvent.click(await screen.findByText("Apply"))
  await waitFor(() => expect(mocks.rejected).toHaveBeenCalledWith(true))
  expect(mocks.upload).not.toHaveBeenCalled()
})
