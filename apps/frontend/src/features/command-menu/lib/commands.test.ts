import { Settings } from "lucide-react"
import { describe, expect, it } from "vitest"

import { visibleCommands, type Command, type CommandContext } from "./commands"

const context: CommandContext = {
  orgSlug: "acme",
  projectSlug: null,
  ticket: null,
  ticketDetail: null,
  sprint: null,
  viewerId: null,
  canSeeOrgMembers: false,
  canCreateProjects: true,
  project: null,
  canCreateTickets: true,
  canEditTickets: true,
  canArchiveTickets: true,
  canDeleteTickets: true,
  canPlanSprints: true,
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
})
