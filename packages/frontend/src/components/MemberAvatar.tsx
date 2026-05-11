import { useState } from "react"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage
} from "@/components/ui/avatar"
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
          src={member.image}
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
  const fontSize = Math.max(10, Math.round(size * 0.5))
  return (
    <AvatarGroup className={className}>
      {visible.map((s, i) => {
        const initial = (s.name || s.email || "?").charAt(0).toUpperCase()
        return (
          <Avatar key={i} style={{ width: size, height: size }}>
            {s.image && <AvatarImage src={s.image} alt="" />}
            <AvatarFallback style={{ fontSize }}>{initial}</AvatarFallback>
          </Avatar>
        )
      })}
      {overflow > 0 && (
        <AvatarGroupCount
          style={{
            width: size,
            height: size,
            fontSize: Math.max(10, Math.round(size * 0.42))
          }}
        >
          +{overflow}
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  )
}
