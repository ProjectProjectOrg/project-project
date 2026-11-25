import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { Lock } from "@pp/ui/icons"
import { useState } from "react"

import {
  STATUS,
  StatusIcon,
  type Status
} from "../../../components/list-row/demos/parts/tickets"
import { LOCKED, RoleTabs, type Role } from "./parts/lock"

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const ORDER: ReadonlyArray<Status> = ["todo", "progress", "review", "done"]

const caption = (status: Status, role: Role) => {
  if (!(status in LOCKED)) return null
  if (role === "pm") return "Locked. You can move tickets here as a PM."
  return status === "review"
    ? "Locked. Moves here when a pull request opens."
    : "Locked. Moves here when a pull request merges."
}

function Option({ status, role }: Readonly<{ status: Status; role: Role }>) {
  const note = caption(status, role)
  return (
    <span className="flex min-w-0 flex-1 items-start gap-2">
      <span className="grid h-5 place-items-center">
        <StatusIcon status={status} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          {STATUS[status].label}
          {note ? (
            <Lock
              className="size-3.5 text-muted-foreground"
              strokeWidth={1.75}
            />
          ) : null}
        </span>
        {note ? (
          <span className="text-caption font-normal text-pretty text-muted-foreground">
            {note}
          </span>
        ) : null}
      </span>
    </span>
  )
}

export default function Picker() {
  const [open, setOpen] = useState(true)
  const [role, setRole] = useState<Role>("developer")
  const [status, setStatus] = useState<Status>("progress")
  return (
    <div className="flex w-full flex-col items-start gap-4">
      <RoleTabs role={role} onRole={setRole} />
      <div className="h-80">
        <DropdownMenu
          open={open}
          onOpenChange={(next, details) => {
            if (USER_TOGGLES.has(details.reason)) setOpen(next)
          }}
          modal={false}
        >
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                tone="strong"
                aria-label={`Status: ${STATUS[status].label}`}
              />
            }
          >
            <StatusIcon status={status} />
            {STATUS[status].label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="w-64">
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={setStatus}
              items={ORDER.map((value) => ({
                value,
                textValue: STATUS[value].label,
                disabled: value in LOCKED && role !== "pm" && value !== status,
                closeOnClick: false,
                label: <Option status={value} role={role} />
              }))}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
