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
      accent="#5F7A4F"
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

it("picks the emoji inline rather than in a popover", () => {
  const { container } = renderForm()

  fireEvent.click(screen.getByRole("button", { name: "Emoji" }))

  expect(container.querySelector("[data-slot='popover-content']")).toBeNull()
  expect(
    container.querySelector("[data-slot='emoji-picker-search']")
  ).toBeTruthy()
})

it("offers no call to action on the source step", () => {
  renderForm()

  expect(screen.queryByRole("button", { name: "Apply" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull()
})
