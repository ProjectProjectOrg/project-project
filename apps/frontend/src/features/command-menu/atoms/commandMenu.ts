import * as Atom from "effect/reactivity/Atom"

import { CLOSED_COMMAND_MENU, type CommandMenuState } from "../lib/commandMenu"
import type { CommandScope } from "../lib/commandScopes"

export const commandMenuState = Atom.make<CommandMenuState>(
  CLOSED_COMMAND_MENU
).pipe(Atom.keepAlive)

export const commandScopes = Atom.make<ReadonlyArray<CommandScope>>([]).pipe(
  Atom.keepAlive
)
