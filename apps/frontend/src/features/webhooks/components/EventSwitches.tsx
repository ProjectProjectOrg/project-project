import type { ProjectEventKind } from "@pp/shared"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSwitch } from "@/components/shell/settings/SettingsTextField"
import {
  eventLabel,
  sprintEvents,
  ticketEvents
} from "@/features/webhooks/lib/webhookEvents"
import { m } from "@/paraglide/messages"

type EventSwitchesProps = Readonly<{
  events: ReadonlyArray<ProjectEventKind>
  onToggle: (kind: ProjectEventKind, on: boolean) => void
  disabled?: boolean
}>

export function EventSwitches({
  events,
  onToggle,
  disabled = false
}: EventSwitchesProps) {
  const group = (title: string, kinds: ReadonlyArray<ProjectEventKind>) => (
    <SettingsSection title={title}>
      <SettingsGroup>
        {kinds.map((kind) => {
          const checked = events.includes(kind)
          return (
            <SettingsRow
              key={kind}
              label={eventLabel[kind]()}
              description={<span className="font-mono">{kind}</span>}
            >
              <SettingsSwitch
                checked={checked}
                disabled={disabled || (checked && events.length === 1)}
                onCheckedChange={(on) => onToggle(kind, on)}
              />
            </SettingsRow>
          )
        })}
      </SettingsGroup>
    </SettingsSection>
  )
  return (
    <>
      {group(m.webhooks_events_tickets(), ticketEvents)}
      {group(m.webhooks_events_sprints(), sprintEvents)}
    </>
  )
}
