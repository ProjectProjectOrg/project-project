import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { m } from "@/paraglide/messages"

export function MarkAsCommands({ chip, onBack, env }: CommandPageProps) {
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_mark_as_placeholder()}
      onBack={onBack}
      items={MARK_KINDS.map(({ kind, icon, label }) => ({
        value: kind,
        label: label(),
        icon
      }))}
      onSelect={(item) => {
        const mark = MARK_KINDS.find(({ kind }) => kind === item.value)
        if (mark !== undefined) env.open(`mark:${mark.kind}`)
      }}
    />
  )
}
