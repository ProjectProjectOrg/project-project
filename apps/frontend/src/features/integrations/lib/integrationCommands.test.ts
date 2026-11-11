import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { HardDrive } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import type {
  CommandContext,
  CommandEnv
} from "@/features/command-menu/lib/commands"
import { scoreSearch } from "@/features/command-menu/lib/searchScore"
import type { IntegrationState } from "@/features/integrations/hooks/useOrgIntegrations"

import {
  integrationCommands,
  type IntegrationCommandEntry
} from "./integrationCommands"

const context: CommandContext = {
  orgSlug: "acme",
  projectSlug: null,
  ticket: null,
  ticketDetail: null,
  ticketSprint: null,
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

const missing: IntegrationState = {
  tone: "idle",
  label: "Not set up",
  connected: false,
  loading: false
}

const connected: IntegrationState = {
  tone: "connected",
  label: "Connected",
  connected: true,
  loading: false
}

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
      state: { ...connected, tone: "attention" },
      prerequisite: false,
      suggested: true
    },
    {
      name: "loading connection",
      state: { ...missing, loading: true },
      prerequisite: true,
      suggested: false
    },
    {
      name: "failed status read",
      state: { ...missing, tone: "attention" },
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
      expect(commands[0]?.searchOnly).toBe(!suggested)
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
    if (command === undefined || !("run" in command))
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
