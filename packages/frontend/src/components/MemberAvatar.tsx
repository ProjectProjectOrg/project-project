// Compact circular avatar — shared between the ticket list (assignee row),
// the assignee picker, member rows, and the project list cards.
//
// Renders the member's image (GitHub avatar, populated by Better Auth on
// sign-in) when available, otherwise falls back to a name-initial circle.
// The image is also dropped to the initial fallback if it 404s mid-session
// — local `errored` state tracks that per render.
//
// Accepts a duck-typed shape (`name | email | image`) instead of the full
// `Member` so it works for the current user (`User`) too without a wrapper.

import { useState } from "react"
import { cn } from "@/lib/utils"

export interface AvatarSubject {
  readonly name?: string | null
  readonly email?: string | null
  readonly image?: string | null
}

export function MemberAvatar({
  member,
  size = 20,
  className
}: {
  member: AvatarSubject
  size?: number
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const initial = (member.name || member.email || "?").charAt(0).toUpperCase()
  const showImage = !!member.image && !errored
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.5))
      }}
      aria-hidden
    >
      {showImage ? (
        <img
          src={member.image!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="size-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  )
}

// Stacked avatars with overlap. Used on project cards / dashboard tiles to
// surface "who's on this" without a full member list.
export function AvatarStack({
  subjects,
  size = 24,
  max = 4,
  className
}: {
  subjects: ReadonlyArray<AvatarSubject>
  size?: number
  max?: number
  className?: string
}) {
  const visible = subjects.slice(0, max)
  const overflow = subjects.length - visible.length
  // Each subsequent avatar slides over the previous by ~35% of its width via
  // negative margin, with a thin background-colored ring so adjacent avatars
  // read as distinct circles, not a smeared blob.
  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((s, i) => (
        <span
          key={i}
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.35) }}
          className="ring-2 ring-background rounded-full"
        >
          <MemberAvatar member={s} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          style={{
            marginLeft: -Math.round(size * 0.35),
            width: size,
            height: size,
            fontSize: Math.max(10, Math.round(size * 0.42))
          }}
          className="inline-grid shrink-0 place-items-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-background"
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
