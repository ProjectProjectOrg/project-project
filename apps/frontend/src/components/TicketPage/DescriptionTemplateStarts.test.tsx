import { EMPTY_LAYER, resolveLibrary, type Library } from "@pp/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { DescriptionTemplateStarts } from "./DescriptionTemplateStarts"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({
    to,
    params: _params,
    ...props
  }: ComponentProps<"a"> & { to: string; params: unknown }) => (
    <a href={to} {...props} />
  )
}))

afterEach(cleanup)

const EMPTY_LIBRARY: Library = resolveLibrary(
  { org: EMPTY_LAYER, project: null },
  { org: {}, project: null },
  false
)

const renderStarts = (body: string, library: Library = BUILTIN_LIBRARY) => {
  const onStart = vi.fn()
  const onMore = vi.fn()
  render(
    <DescriptionTemplateStarts
      orgSlug="org"
      slug="project"
      library={library}
      ticketType="feat"
      body={body}
      onStart={onStart}
      onMore={onMore}
    />
  )
  return { onStart, onMore }
}

it("shows only while the body is empty", () => {
  renderStarts("Some notes")
  expect(screen.queryByRole("group")).toBeNull()
  cleanup()
  renderStarts("  \n")
  expect(screen.getByRole("group")).toBeTruthy()
})

it("lists the type's default first", () => {
  renderStarts("")
  const names = screen
    .getAllByRole("button")
    .map((button) => button.textContent)
  expect(names).toEqual(["Feature", "Bug report", "Chore", "more…"])
})

it("applies the clicked template", () => {
  const { onStart, onMore } = renderStarts("")
  fireEvent.click(screen.getByRole("button", { name: "Bug report" }))
  expect(onStart).toHaveBeenCalledTimes(1)
  expect(onStart.mock.calls[0][0].key).toBe("bug-report")
  fireEvent.click(screen.getByRole("button", { name: "more…" }))
  expect(onMore).toHaveBeenCalledTimes(1)
})

it("teaches what templates are for even when none are adopted yet", () => {
  renderStarts("", EMPTY_LIBRARY)
  expect(screen.getByRole("group")).toBeTruthy()
  expect(screen.queryByRole("button")).toBeNull()
  expect(screen.getByText("No templates yet")).toBeTruthy()
})

it("links the empty state to the project settings gallery", () => {
  renderStarts("", EMPTY_LIBRARY)
  const link = screen.getByRole("link", { name: "Browse the gallery" })
  expect(link.getAttribute("href")).toBe(
    "/orgs/$orgSlug/projects/$slug/settings/templates"
  )
})

it("shows nothing for the empty state once the body has content", () => {
  renderStarts("Some notes", EMPTY_LIBRARY)
  expect(screen.queryByRole("group")).toBeNull()
})
