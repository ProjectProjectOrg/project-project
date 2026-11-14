import { MemberAvatar } from "@pp/ui/member-avatar"

import { PEOPLE } from "./people"

const ROLES = ["Owner", "Admin", "Member"] as const

export default function MemberList() {
  return (
    <ul className="w-full max-w-md divide-y divide-border/60">
      {PEOPLE.slice(3, 6).map((person, index) => (
        <li key={person.id} className="flex items-center gap-3 py-2.5">
          <MemberAvatar member={person} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-body">{person.name}</div>
            <div className="truncate text-caption text-muted-foreground">
              {person.email}
            </div>
          </div>
          <span className="text-caption text-muted-foreground">
            {ROLES[index]}
          </span>
        </li>
      ))}
    </ul>
  )
}
