import type { User } from "@projectproject/shared"
import { MemberAvatar } from "@/components/MemberAvatar"
import { getLocale } from "@/paraglide/runtime"

export function UserTimestamp({
  user,
  timestamp
}: {
  user: User | null
  timestamp: Date
}) {
  const locale = getLocale()

  return (
    <div className="flex min-w-0 items-center gap-2">
      {user && (
        <span className="flex min-w-0 items-center gap-1.5">
          <MemberAvatar member={user} size={18} />
          <span className="truncate text-xs">{user.name || user.email}</span>
        </span>
      )}
      <time
        dateTime={timestamp.toISOString()}
        title={timestamp.toLocaleString(locale)}
        className="shrink-0 text-xs"
      >
        {timestamp.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric"
        })}
      </time>
    </div>
  )
}
