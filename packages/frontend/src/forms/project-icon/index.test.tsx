import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  update: vi.fn(async () => ({ _tag: "Success", value: {} })),
  upload: vi.fn(async () => ({ _tag: "Success", value: { id: "att_1" } }))
}))

vi.mock("@effect/atom-react", () => ({
  useAtomSet: (atom: string) =>
    atom === "upload-atom" ? mocks.upload : mocks.update,
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
  orgStorageAtom: () => "storage-atom"
}))

import { ProjectIconForm } from "./index"

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
  vi.clearAllMocks()
})

const renderForm = () =>
  render(
    <ProjectIconForm
      orgSlug="org"
      slug="proj"
      icon="🎨"
      iconImage={null}
      onDone={() => {}}
    />
  )

it("rejects a file over the attachment size limit without starting a draft", async () => {
  const { container } = renderForm()

  fireEvent.click(screen.getByRole("button", { name: "Custom image" }))

  const fileInput = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement
  const tooBig = new File([new Uint8Array(1)], "huge.png", {
    type: "image/png"
  })
  Object.defineProperty(tooBig, "size", { value: 30 * 1024 * 1024 })

  fireEvent.change(fileInput, { target: { files: [tooBig] } })

  const alert = await screen.findByRole("alert")
  expect(alert.textContent).toContain("That file can't be used")
  expect(fileInput.value).toBe("")
})

it("does not offer gif in the file picker's accept list", () => {
  const { container } = renderForm()

  fireEvent.click(screen.getByRole("button", { name: "Custom image" }))

  const fileInput = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement

  expect(fileInput.accept).not.toContain("gif")
  expect(fileInput.accept).toContain("image/png")
})

it("saves the emoji and clears any image when the emoji source is applied", async () => {
  renderForm()

  fireEvent.click(screen.getByRole("button", { name: "Next" }))

  await vi.waitFor(() => expect(mocks.update).toHaveBeenCalled())
  expect(mocks.update).toHaveBeenCalledWith({ icon: "🎨", iconImage: null })
  expect(mocks.upload).not.toHaveBeenCalled()
})
