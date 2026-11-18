import { OrgActor } from "@pp/shared"
import { HardDrive } from "@pp/ui/icons"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import {
  Command,
  type CommandContext,
  type CommandEnv
} from "@/features/command-menu/lib/commands"
import { scoreSearch } from "@/features/command-menu/lib/searchScore"
import { IntegrationState } from "@/features/integrations/hooks/useOrgIntegrations"

import {
  integrationCommands,
  type IntegrationCommandEntry
} from "./integrationCommands"

const context: CommandContext = {
  orgSlug: "acme",
  orgActor: OrgActor.none,
  projectActor: null,
  projectSlug: null,
  routeProjectSlug: null,
  ticket: null,
  selection: [],
  ticketData: null,
  ticketDetail: null,
  ticketSprint: null,
  ticketSubscribed: null,
  sprint: null,
  view: null,
  viewerId: null,
  canSeeOrgMembers: false,
  canCreateProjects: false,
  canSendFeedback: false,
  canHoldChildren: false,
  project: null,
  canManageProject: false,
  tickets: {
    create: false,
    edit: false,
    assign: false,
    split: false,
    move: false,
    archive: false,
    delete: false,
    stackBranch: false,
    clearBranch: false,
    planSprints: false
  }
}

const entry: IntegrationCommandEntry = {
  id: "storage",
  name: "Object storage",
  icon: HardDrive,
  parent: () => "Organization settings",
  keywords: ["s3", "uploads", "attachments"],
  to: "/orgs/acme/settings/integrations/storage",
  allowed: true,
  prerequisite: true
}

const missing = IntegrationState.notSetUp({ tone: "idle", label: "Not set up" })

const connected = IntegrationState.connected({
  tone: "connected",
  label: "Connected"
})

describe("integration commands", () => {
  it.each([
    {
      name: "missing prerequisite",
      state: missing,
      prerequisite: true,
      suggested: true
    },
    {
      name: "unused optional integration",
      state: missing,
      prerequisite: false,
      suggested: false
    },
    {
      name: "connected integration",
      state: connected,
      prerequisite: true,
      suggested: false
    },
    {
      name: "broken connection",
      state: IntegrationState.attention({
        tone: "attention",
        label: "Needs attention"
      }),
      prerequisite: false,
      suggested: true
    },
    {
      name: "loading connection",
      state: IntegrationState.loading({ tone: "idle", label: "" }),
      prerequisite: true,
      suggested: false
    },
    {
      name: "failed status read",
      state: IntegrationState.unavailable({
        tone: "attention",
        label: "Unavailable"
      }),
      prerequisite: true,
      suggested: false
    }
  ] satisfies ReadonlyArray<
    Readonly<{
      name: string
      state: IntegrationState
      prerequisite: boolean
      suggested: boolean
    }>
  >)(
    "suggests only actionable setup: $name",
    ({ state, prerequisite, suggested }) => {
      const commands = integrationCommands([{ ...entry, state, prerequisite }])
      expect(commands[0]?.listed).toBe(suggested ? "always" : "search")
      expect(commands[0]?.group).toBe(suggested ? "setup" : "navigation")
    }
  )

  it("hides settings the viewer cannot access", () => {
    expect(
      integrationCommands([{ ...entry, allowed: false, state: missing }])
    ).toEqual([])
  })

  it("keeps connected settings searchable by their aliases", () => {
    const [command] = integrationCommands([{ ...entry, state: connected }])
    expect(command).toBeDefined()
    if (command === undefined) throw new Error("Expected a searchable command")
    const searchable = {
      label: command.label(context),
      keywords: command.keywords
    }
    for (const query of [
      "s3",
      "uploads",
      "attachments",
      "object storage",
      "storage settings"
    ])
      expect(scoreSearch(searchable, query)).not.toBeNull()
  })

  it("opens the scoped settings destination and closes the menu", () => {
    const [command] = integrationCommands([entry])
    const navigate = vi.fn<CommandEnv["navigate"]>()
    const close = vi.fn<CommandEnv["close"]>()
    expect(command).toBeDefined()
    if (command === undefined || !Command.$is("run")(command))
      throw new Error("Expected a navigation command")
    const registry = AtomRegistry.make()
    const env: CommandEnv = {
      registry,
      navigate,
      close,
      execute: () => undefined,
      copy: vi.fn<CommandEnv["copy"]>(),
      open: vi.fn<CommandEnv["open"]>(),
      actOn: vi.fn<CommandEnv["actOn"]>()
    }
    command.run(context, env)
    registry.dispose()
    expect(navigate).toHaveBeenCalledWith(
      "/orgs/acme/settings/integrations/storage"
    )
    expect(close).toHaveBeenCalledOnce()
  })
})
