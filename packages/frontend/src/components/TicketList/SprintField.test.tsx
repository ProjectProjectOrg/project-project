import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { afterEach, expect, it, vi } from "vitest"
import { GroupId } from "@projectproject/shared"

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => Result.success([], { waiting: false })
}))

vi.mock("@/atoms/sprints", () => ({
  projectKey: (orgSlug: string, slug: string) => `${orgSlug}/${slug}`,
  sprintsListAtom: () => "sprints",
  sprintMembershipAtom: () => "membership",
  useAddTicketsToSprint: () => vi.fn(),
  useRemoveTicketsFromSprint: () => vi.fn()
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
