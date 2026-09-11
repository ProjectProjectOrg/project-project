import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

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

import { ProjectIconUpload } from "./ProjectIconUpload"

afterEach(cleanup)

it("shows a validation message without a draft when the picked file is rejected", async () => {
  const { container } = render(
    <ProjectIconUpload orgSlug="org" slug="proj" iconImage={null} />
  )

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
  expect(container.querySelector(".flex.flex-col.gap-2 > img")).toBeNull()
  expect(fileInput.value).toBe("")
})

it("does not offer gif in the file picker's accept list", () => {
  const { container } = render(
    <ProjectIconUpload orgSlug="org" slug="proj" iconImage={null} />
  )
  const fileInput = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement
  expect(fileInput.accept).not.toContain("gif")
})

it("rejects a gif even when it gets past the picker's accept hint", async () => {
  const { container } = render(
    <ProjectIconUpload orgSlug="org" slug="proj" iconImage={null} />
  )
  const fileInput = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement
  const gif = new File([new Uint8Array(8)], "loop.gif", { type: "image/gif" })

  fireEvent.change(fileInput, { target: { files: [gif] } })

  const alert = await screen.findByRole("alert")
  expect(alert.textContent).toContain("That file can't be used")
})
