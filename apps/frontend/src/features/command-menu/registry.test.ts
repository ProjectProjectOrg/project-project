import { Tools } from "@pp/shared"
import { Tool } from "effect/ai"
import * as Context from "effect/Context"
import { describe, expect, it } from "vitest"

import type { ToolName } from "./lib/commands"
import { commandRegistry } from "./registry"

const NOT_IN_COMMAND_MENU: Readonly<Partial<Record<ToolName, string>>> = {
  prepare_ticket_attachment: "Files are attached from the editor",
  create_comment: "Comments are written on the ticket page",
  sync_git_state: "Git state is synced by automation",
  attach_branch: "Branches are attached from the ticket's git panel",
  stack_branch: "Stacks are edited from the ticket's git panel",
  unstack_branch: "Stacks are edited from the ticket's git panel",
  update_sprint: "Sprints are edited on the sprints page",
  complete_sprint: "Sprints are completed on the sprints page",
  rebuild_ticket_index: "Index repair is an operator task",
  add_tickets_to_group: "Tickets are moved into sprints by drag and drop"
}

const writeTools = Object.entries(Tools.tools)
  .filter(([, tool]) => !Context.get(tool.annotations, Tool.Readonly))
  .map(([name]) => name)

const coveredTools = new Set<string>(
  commandRegistry.flatMap((command) =>
    command.tool === undefined ? [] : [command.tool]
  )
)

describe("command registry and the tool catalog", () => {
  it("covers every write tool with a command or says why not", () => {
    const uncovered = writeTools.filter(
      (name) => !coveredTools.has(name) && !(name in NOT_IN_COMMAND_MENU)
    )
    expect(uncovered).toEqual([])
  })

  it("only excuses write tools that no command covers", () => {
    const stale = Object.keys(NOT_IN_COMMAND_MENU).filter(
      (name) => !writeTools.includes(name) || coveredTools.has(name)
    )
    expect(stale).toEqual([])
  })
})
