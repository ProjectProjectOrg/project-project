import { m } from "@/paraglide/messages"

import { GroupingMenu } from "./GroupingMenu"
import { useTicketToolbar } from "./toolbar/context"

type BacklogGrouping = "status" | "sprint"

export function BacklogGroupingControl({
  value,
  onChange
}: Readonly<{
  value: BacklogGrouping
  onChange: (value: BacklogGrouping) => void
}>) {
  const { controlsCompact } = useTicketToolbar()
  return (
    <GroupingMenu
      value={value}
      options={[
        { key: "status", label: m.tickets_grouping_status() },
        { key: "sprint", label: m.tickets_grouping_sprint() }
      ]}
      onChange={onChange}
      compact={controlsCompact}
    />
  )
}
