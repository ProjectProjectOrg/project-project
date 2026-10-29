import { Command } from "effect/cli"

import {
  initCommand,
  loginCommand,
  logoutCommand,
  serversCommand
} from "./account"
import { attachCommand } from "./attach"
import { callCommand, toolsCommand } from "./call"
import { catalogEntries, commandFor } from "./catalog"
import { root } from "./root"
import { upgradeCommand } from "./upgrade"

const groupDescriptions: Readonly<Record<string, string>> = {
  tickets: "Read, create and change tickets.",
  orgs: "Organizations you belong to.",
  projects: "Projects in an organization.",
  groups: "Sprints, epics, milestones and other groups of tickets.",
  sprints: "Plan, run and complete sprints.",
  statuses: "A project's workflow statuses.",
  tags: "A project's tags.",
  members: "A project's members.",
  blocks: "Reusable ticket blocks.",
  templates: "Ticket templates.",
  branches: "Link GitHub branches to tickets.",
  attachments: "Upload files to tickets.",
  git: "GitHub branch and pull request state."
}

const leaves = new Map<string, Array<ReturnType<typeof commandFor>>>()
const topLevel: Array<ReturnType<typeof commandFor>> = []

for (const entry of catalogEntries) {
  const [group, ...rest] = entry.command
  if (rest.length === 0) {
    topLevel.push(commandFor(entry))
  } else {
    leaves.set(group, [...(leaves.get(group) ?? []), commandFor(entry)])
  }
}

const groupCommand = (name: string) => {
  const commands = leaves.get(name) ?? []
  const base = Command.make(name).pipe(
    Command.withDescription(groupDescriptions[name] ?? `${name} commands.`)
  )
  return name === "tickets"
    ? base.pipe(Command.withSubcommands([...commands, attachCommand]))
    : base.pipe(Command.withSubcommands(commands))
}

export const pp = root.pipe(
  Command.withSubcommands([
    loginCommand,
    logoutCommand,
    serversCommand,
    initCommand,
    upgradeCommand,
    toolsCommand,
    callCommand,
    ...topLevel,
    ...[...leaves.keys()].map(groupCommand)
  ])
)
