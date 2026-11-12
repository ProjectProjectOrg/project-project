import {
  OrgActor,
  TicketId,
  TicketRank,
  TicketStatus,
  TypeKey
} from "@pp/shared"
import * as Schema from "effect/Schema"
import { Settings } from "lucide-react"
import { describe, expect, it } from "vitest"

import { visibleCommands, type Command, type CommandContext } from "./commands"

const decodeTicketId = Schema.decodeSync(TicketId)
const decodeStatus = Schema.decodeSync(TicketStatus)

const context: CommandContext = {
  orgSlug: "acme",
  orgActor: OrgActor.none,
  projectActor: null,
  projectSlug: null,
  ticket: null,
  selection: [],
  ticketDetail: null,
  ticketSprint: null,
  sprint: null,
  view: null,
  viewerId: null,
  canSeeOrgMembers: false,
  canCreateProjects: true,
  canSendFeedback: true,
  canHoldChildren: true,
  project: null,
  tickets: {
    create: true,
    edit: true,
    assign: true,
    split: true,
    move: true,
    archive: true,
    delete: true,
    stackBranch: true,
    clearBranch: true,
    planSprints: true
  },
  canManageProject: true
}

const command = (
  id: string,
  group: Command["group"],
  when?: Command["when"]
): Command => ({
  id,
  group,
  label: () => id,
  icon: Settings,
  when,
  page: "theme"
})

describe("visibleCommands", () => {
  it("orders commands by group and drops those that don't apply", () => {
    const commands = [
      command("log-out", "account"),
      command("backlog", "navigation", (ctx) => ctx.projectSlug !== null),
      command("dashboard", "navigation"),
      command("status", "ticket", (ctx) => ctx.ticket !== null),
      command("theme", "settings")
    ]

    expect(visibleCommands(commands, context).map((c) => c.id)).toEqual([
      "dashboard",
      "theme",
      "log-out"
    ])
    expect(
      visibleCommands(commands, { ...context, projectSlug: "app" }).map(
        (c) => c.id
      )
    ).toEqual(["backlog", "dashboard", "theme", "log-out"])
  })

  it("keeps only bulk ticket commands while several tickets are selected", () => {
    const commands = [
      { ...command("status", "ticket"), bulk: true },
      command("copy-id", "ticket"),
      command("theme", "settings")
    ]
    const tickets = [
      { id: "T-1", title: "a" },
      { id: "T-2", title: "b" }
    ].map(({ id, title }) => ({
      id: decodeTicketId(id),
      title,
      status: decodeStatus("todo"),
      priority: "med" as const,
      type: TypeKey.make("feat"),
      estimate: null,
      tags: [],
      assignees: [],
      flag: null,
      rank: TicketRank.make("a0")
    }))
    expect(
      visibleCommands(commands, { ...context, selection: tickets }).map(
        (c) => c.id
      )
    ).toEqual(["status", "theme"])
  })
})
