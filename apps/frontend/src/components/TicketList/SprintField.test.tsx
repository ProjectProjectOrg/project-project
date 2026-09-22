import { GroupId } from "@pp/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { afterEach, expect, it, vi } from "vitest"

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => Result.success([], { waiting: false }),
  useAtomSet: () => vi.fn()
}))

vi.mock("@/features/sprints/atoms/sprintList", () => ({
  sprintListRequest: (orgSlug: string, slug: string) => ({
    params: { orgSlug, slug }
  }),
  sprintList: () => "sprints",
  sprintMembership: () => "membership",
  addTicketsToSprint: () => "add",
  removeTicketsFromSprint: () => "remove"
}))

import { SprintSelect } from "./SprintField"

afterEach(cleanup)

it("keeps an unavailable sprint assignment clearable", async () => {
  const onChange = vi.fn()

  render(
    <SprintSelect
      orgSlug="org"
      slug="project"
      value={Schema.decodeSync(GroupId)("G-1")}
      onChange={onChange}
    />
  )

  fireEvent.click(screen.getByRole("button", { name: "Assign sprint" }))
  fireEvent.click(await screen.findByText("Remove from sprint"))

  expect(onChange).toHaveBeenCalledWith(null)
})
