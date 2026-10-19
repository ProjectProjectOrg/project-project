import { RegistryContext } from "@effect/atom-react"
import { TicketDetail, type StackLayerState } from "@pp/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"

import { m } from "@/paraglide/messages"

import { StackedBranches } from "./TicketStack"

const access = vi.hoisted(() => ({ canWrite: true }))
vi.mock("@/lib/access", () => ({
  useProjectActor: () => ({ call: () => access.canWrite })
}))

const ticket = Schema.decodeSync(TicketDetail)({
  id: "T-1",
  title: "Ticket",
  status: "todo",
  type: "other",
  priority: "med",
  tags: [],
  branch: "feat/T-1",
  pr: 80,
  prState: "closed",
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
  creator: null,
  updater: null,
  body: ""
})
let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
  vi.restoreAllMocks()
})

it.each([
  ["own closed PR", true, "closed", true, false],
  ["stacked closed PR", false, "closed", true, false],
  ["open PR", false, "open", false, false],
  ["merged PR", false, "merged", false, false],
  ["read-only closed PR", false, "closed", false, true]
] as const)(
  "offers a replacement PR only when allowed: %s",
  async (_name, own, state, replacement, readOnly) => {
    access.canWrite = !readOnly
    registry = Registry.make()
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const layer: StackLayerState = {
      branch: "feat/stack",
      base: "feat/T-1",
      depth: 1,
      deleted: false,
      pr: {
        number: 81,
        url: "https://github.com/acme/app/pull/81",
        title: "Stack PR",
        state,
        draft: false,
        landed: false,
        checks: null
      }
    }
    render(
      <RegistryContext.Provider value={registry}>
        <StackedBranches
          orgSlug="acme"
          slug="app"
          ticket={ticket}
          github={{
            repoId: "repo-a",
            repoOwner: "acme",
            repoName: "app",
            defaultBaseBranch: "main"
          }}
          own={
            own
              ? {
                  tag: "pr_closed",
                  branch: "feat/T-1",
                  baseBranch: "main",
                  number: 80,
                  url: "https://github.com/acme/app/pull/80",
                  title: "Own PR"
                }
              : { tag: "no_branch" }
          }
          stack={own ? [] : [layer]}
          pulse={false}
          variant="bordered"
        />
      </RegistryContext.Provider>
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: m.git_stack_branch_menu_label({
          branch: own ? "feat/T-1" : layer.branch
        })
      })
    )
    await screen.findByRole("menu")
    const action = screen.queryByRole("menuitem", {
      name: m.git_open_new_pr_button()
    })
    expect(action !== null).toBe(replacement)
    if (action) fireEvent.click(action)
    expect(open.mock.calls).toEqual(
      replacement
        ? [
            [
              `https://github.com/acme/app/compare/${own ? "main...feat/T-1" : "feat/T-1...feat/stack"}?quick_pull=1`,
              "_blank",
              "noreferrer"
            ]
          ]
        : []
    )
  }
)
