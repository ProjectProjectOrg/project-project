import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  update: vi.fn(async () => ({ _tag: "Success", value: {} })),
  upload: vi.fn(async () => ({ _tag: "Success", value: { id: "att_1" } })),
  preview: vi.fn(),
  compress: vi.fn()
}))

vi.mock("@effect/atom-react", () => ({
  useAtomSet: (atom: string) =>
    atom === "upload-atom"
      ? mocks.upload
      : atom === "preview-atom"
        ? mocks.preview
        : mocks.update,
  useAtomValue: (atom: string) =>
    atom === "storage-atom"
      ? { _tag: "Success", waiting: false, value: { status: "active" } }
      : { waiting: false }
}))
vi.mock("@/atoms/attachments", () => ({
  uploadProjectImageAtom: () => "upload-atom"
}))
vi.mock("@/atoms/projects", () => ({
  projectKey: (org: string, slug: string) => `${org}/${slug}`,
  updateProjectAtom: () => "update-atom",
  projectBannerPreviewAtom: () => "preview-atom"
}))
vi.mock("@/atoms/storage", () => ({ orgStorageAtom: () => "storage-atom" }))
vi.mock("@/lib/imageCompression", () => ({ compressBanner: mocks.compress }))

import { bannerPresets } from "@/components/project-banner-presets"
import { m } from "@/paraglide/messages"
import { ProjectBannerForm } from "./index"

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:banner")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it("advances to crop on the first artwork selection without an existing banner", async () => {
  render(<ProjectBannerForm orgSlug="org" slug="proj" banner={null} />)
  fireEvent.click(
    await screen.findByRole("button", { name: bannerPresets[0]!.label() })
  )
  expect(
    await screen.findByRole("heading", {
      name: m.project_banner_step_crop_heading()
    })
  ).toBeTruthy()
  expect(mocks.update).not.toHaveBeenCalled()
})

it("shows compression failures in the crop step without uploading or saving", async () => {
  mocks.compress.mockRejectedValueOnce(new Error("cannot decode image"))
  const { container } = render(
    <ProjectBannerForm orgSlug="org" slug="proj" banner={null} />
  )
  await screen.findByRole("button", { name: bannerPresets[0]!.label() })
  const input = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement
  fireEvent.change(input, {
    target: {
      files: [new File(["bad image"], "banner.png", { type: "image/png" })]
    }
  })
  fireEvent.click(
    await screen.findByRole("button", {
      name: m.project_banner_settings_apply()
    })
  )
  expect((await screen.findByRole("alert")).textContent).toBe(
    m.project_banner_settings_load_error()
  )
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it("does not upload or save when cancelled during compression", async () => {
  const file = new File(["image"], "banner.png", { type: "image/png" })
  let finishCompression!: (value: { file: File; placeholder: string }) => void
  const pending = new Promise<{ file: File; placeholder: string }>(
    (resolve) => {
      finishCompression = resolve
    }
  )
  mocks.compress.mockReturnValueOnce(pending)
  const onDone = vi.fn()
  const { container, unmount } = render(
    <ProjectBannerForm
      orgSlug="org"
      slug="proj"
      banner={null}
      onDone={onDone}
    />
  )
  await screen.findByRole("button", { name: bannerPresets[0]!.label() })
  const input = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(
    await screen.findByRole("button", {
      name: m.project_banner_settings_apply()
    })
  )
  await waitFor(() => expect(mocks.compress).toHaveBeenCalled())
  unmount()

  await act(async () => {
    finishCompression({ file, placeholder: "data:image/png;base64,AA==" })
    await pending
  })

  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(onDone).not.toHaveBeenCalled()
})
