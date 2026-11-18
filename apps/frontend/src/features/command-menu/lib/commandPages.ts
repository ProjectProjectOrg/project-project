import type { ReactNode } from "react"

import type { CommandContext, CommandEnv } from "./commands"

export type CommandPageProps = Readonly<{
  context: CommandContext
  chip: ReactNode
  onBack: () => void
  env: CommandEnv
}>
