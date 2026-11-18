import { CircleDot } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"

import { PEOPLE } from "./people"

export default function CommentsAndActivity() {
  const [ada, sam] = PEOPLE
  return (
    <div className="grid w-full max-w-xl gap-4">
      <div className="rounded-xl bg-surface-3 shadow-surface-1 corner-squircle">
        {/* The avatar sits 12px from the top and left edges alike. */}
        <header className="flex items-center gap-2 pt-2 pr-1.5 pl-3 text-body">
          <span className="flex min-h-7 items-center gap-2">
            <MemberAvatar member={ada} size={20} />
            <span className="font-semibold">{ada.name}</span>
            <span className="text-caption text-muted-foreground">2h ago</span>
          </span>
        </header>
        <p className="px-3 pt-1 pb-3 text-body">
          Repro'd on the staging build too. The upload stalls once the file is
          over 8 MB.
        </p>
      </div>
      {/* Icons centre on the line, then drop 1px: the line is mostly
          lowercase, whose middle sits below the capitals'. */}
      <p className="px-3 text-body leading-5 text-muted-foreground">
        <span className="inline-flex items-center gap-1 align-bottom whitespace-nowrap text-foreground [&>[data-slot=avatar]]:translate-y-px [&>svg]:translate-y-px">
          <MemberAvatar member={sam} size={16} />
          {sam.name}
        </span>{" "}
        moved this to{" "}
        <span className="inline-flex items-center gap-1 align-bottom whitespace-nowrap text-foreground [&>[data-slot=avatar]]:translate-y-px [&>svg]:translate-y-px">
          <CircleDot className="size-3.5 text-state-info" strokeWidth={1.75} />
          In progress
        </span>
        <span aria-hidden> · </span>
        5m ago
      </p>
    </div>
  )
}
