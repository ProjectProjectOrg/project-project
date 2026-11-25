import { SegmentedTabs } from "@pp/ui/segmented-tabs"

import type { Status } from "../../../../components/list-row/demos/parts/tickets"

export type Role = "developer" | "pm"

export const LOCKED: Readonly<Partial<Record<Status, string>>> = {
  review: "Tickets move here when a pull request opens.",
  done: "Tickets move here when a pull request merges."
}

export const lockLabel = "Locked"

export const lockReason = (status: Status, role: Role) => {
  const route = LOCKED[status] ?? "Only a PM can move tickets here."
  return role === "pm"
    ? `${route} As a PM, you can also move tickets here by hand.`
    : `${route} A PM can also move tickets here by hand.`
}

export const dragTitle = (role: Role) =>
  role === "pm" ? "Locked, but you're a PM" : "Locked"

export const dragReason = (status: Status, role: Role) =>
  role === "pm"
    ? "You can drop here. Others can't."
    : (LOCKED[status] ?? "Only a PM can move tickets here.")

export function RoleTabs({
  role,
  onRole
}: Readonly<{ role: Role; onRole: (role: Role) => void }>) {
  return (
    <SegmentedTabs
      aria-label="View as"
      value={role}
      onValueChange={onRole}
      items={[
        { key: "developer", label: "As a developer" },
        { key: "pm", label: "As a PM" }
      ]}
    />
  )
}
