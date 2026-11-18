import { MemberAvatar } from "@pp/ui/member-avatar"

import { PEOPLE } from "./people"

export default function UserMenuTrigger() {
  const wouter = PEOPLE[3]
  return (
    <div className="flex items-center gap-6">
      <button
        type="button"
        aria-label="Open user menu"
        className="rounded-full outline-none corner-squircle focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MemberAvatar member={wouter} size={36} />
      </button>
      <div className="flex items-center gap-3">
        <MemberAvatar member={wouter} size={40} />
        <div className="leading-tight">
          <div className="text-body font-semibold">{wouter.name}</div>
          <div className="text-caption text-muted-foreground">
            {wouter.email}
          </div>
        </div>
      </div>
    </div>
  )
}
