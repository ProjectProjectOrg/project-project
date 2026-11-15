import { Badge } from "@pp/ui/badge"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Select, SelectTrigger } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"
import {
  Briefcase,
  ShieldCheck,
  UserRound,
  type LucideIcon
} from "lucide-react"
import { useState } from "react"

const ROLES = {
  pm: { label: "PM", icon: ShieldCheck },
  developer: { label: "Developer", icon: UserRound },
  client: { label: "Client", icon: Briefcase }
} as const satisfies Record<string, { label: string; icon: LucideIcon }>

type Role = keyof typeof ROLES

const ROLE_KEYS: ReadonlyArray<Role> = ["pm", "developer", "client"]

const ITEMS = ROLE_KEYS.map((role) => {
  const { label, icon: Icon } = ROLES[role]
  return {
    value: role,
    textValue: label,
    label: (
      <>
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
      </>
    )
  }
})

const PEOPLE = [
  { id: "1", name: "Mara Jansen", email: "mara@acme.dev", role: "pm" },
  { id: "2", name: "Teun de Vries", email: "teun@acme.dev", role: "developer" },
  { id: "3", name: "Lot Bakker", email: "lot@client.nl", role: "client" }
] as const

// The project members list: the role is a badge, and the badge is the
// select's trigger (through `render`), so changing a role happens in place.
export default function MemberRoles() {
  const [roles, setRoles] = useState<Readonly<Record<string, Role>>>(
    Object.fromEntries(PEOPLE.map((person) => [person.id, person.role]))
  )
  return (
    <ul className="w-full max-w-md divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {PEOPLE.map((person) => {
        const role = roles[person.id] ?? "developer"
        const { label, icon: Icon } = ROLES[role]
        return (
          <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
            <MemberAvatar member={person} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body">{person.name}</p>
              <p className="truncate text-caption text-muted-foreground">
                {person.email}
              </p>
            </div>
            <Select
              items={ITEMS}
              value={role}
              onValueChange={(next: Role) =>
                setRoles((current) => ({ ...current, [person.id]: next }))
              }
              contentProps={{ align: "end", className: "w-32" }}
            >
              <SelectTrigger
                render={
                  <Badge
                    tone="muted"
                    size="sm"
                    className="cursor-pointer"
                    render={
                      <button
                        type="button"
                        aria-label={`Role: ${label}. Change role for ${person.name}`}
                      />
                    }
                  >
                    <TextSwap
                      className="gap-1"
                      icon={
                        <Icon className="size-3 shrink-0" strokeWidth={1.75} />
                      }
                    >
                      {label}
                    </TextSwap>
                  </Badge>
                }
              />
            </Select>
          </li>
        )
      })}
    </ul>
  )
}
