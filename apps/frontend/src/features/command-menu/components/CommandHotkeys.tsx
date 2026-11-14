import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { useHotkey, type AppHotkey } from "@tanstack/react-hotkeys"
import { useNavigate, useParams } from "@tanstack/react-router"
import { use } from "react"

import { fireMutation } from "@/api/viewMutation"

import { commandContext } from "../atoms/commandContext"
import {
  commandMenuState,
  commandScopes,
  pointedTicket
} from "../atoms/commandMenu"
import { openCommandMenu } from "../lib/commandMenu"
import {
  runCommand,
  visibleCommands,
  type Command,
  type CommandContext
} from "../lib/commands"
import {
  commandTarget,
  scopeCommands,
  scopeSprint,
  scopeView
} from "../lib/commandScopes"
import { commandRegistry } from "../registry"

export function CommandHotkeys({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const registry = use(RegistryContext)
  const scopes = useAtomValue(commandScopes)
  const params = useParams({ strict: false })
  const navigate = useNavigate()

  const press = (commands: ReadonlyArray<Command>) => {
    const current = registry.get(commandScopes)
    const pointed = registry.get(pointedTicket)
    const target = commandTarget(orgSlug, current, pointed)
    const context: CommandContext = {
      ...registry.get(
        commandContext({
          orgSlug,
          projectSlug: params.slug ?? target.ticket?.slug ?? null,
          ticket: target.ticket
        })
      ),
      selection: openCommandMenu(target.ticket, "root", target.selection)
        .selection,
      sprint: scopeSprint(current),
      view: scopeView(current)
    }
    const [command] = visibleCommands(commands, context)
    if (command === undefined) return
    runCommand(command, context, {
      registry,
      execute: (atom, value) => void fireMutation(registry, atom, value),
      navigate: (to) => void navigate({ to }),
      copy: (text) => void navigator.clipboard.writeText(text),
      open: (page) =>
        registry.set(
          commandMenuState,
          openCommandMenu(target.ticket, page, target.selection, pointed)
        ),
      actOn: (ticket) =>
        registry.set(commandMenuState, openCommandMenu(ticket)),
      close: () => {}
    })
  }

  const byHotkey = new Map<string, Array<Command>>()
  for (const command of [...scopeCommands(scopes), ...commandRegistry]) {
    if (command.hotkey === undefined) continue
    const shared = byHotkey.get(command.hotkey.id)
    if (shared === undefined) byHotkey.set(command.hotkey.id, [command])
    else shared.push(command)
  }
  return [...byHotkey.values()].map(
    (commands) =>
      commands[0]?.hotkey !== undefined && (
        <CommandHotkey
          key={commands[0].hotkey.id}
          hotkey={commands[0].hotkey}
          onPress={() => press(commands)}
        />
      )
  )
}

function CommandHotkey({
  hotkey,
  onPress
}: Readonly<{ hotkey: AppHotkey; onPress: () => void }>) {
  useHotkey(hotkey, (event) => {
    if (!event.repeat) onPress()
  })
  return null
}
