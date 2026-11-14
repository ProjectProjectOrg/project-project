import { useMemo } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage
} from "@/components/ui/avatar"
import { avatarInitials, orbAvatar } from "@/features/members/lib/orbAvatar"
import { orbAvatarUrl } from "@/features/members/lib/paintOrbAvatar"
import { cn } from "@/lib/utils"

export type AvatarSubject = Readonly<{
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}>

const fontSize = (size: number, initials: string) =>
  Math.max(8, Math.round(size * (initials.length > 1 ? 0.34 : 0.44)))

export function MemberAvatar({
  member,
  size = 20,
  className
}: {
  member: AvatarSubject
  size?: number
  className?: string
}) {
  const initials = avatarInitials(member.name, member.email, size)
  const ink = useMemo(
    () => (member.image ? undefined : orbAvatar(member.id).ink),
    [member.id, member.image]
  )
  const generated = useMemo(
    () => (member.image ? undefined : orbAvatarUrl(member.id, size)),
    [member.id, member.image, size]
  )
  return (
    <Avatar
      aria-hidden
      className={cn("inline-flex", className)}
      style={{ width: size, height: size }}
    >
      {member.image && (
        <AvatarImage
          src={member.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="object-cover"
        />
      )}
      <AvatarFallback
        className={cn(
          ink &&
            "bg-transparent bg-cover font-bold text-(--avatar-ink) dark:text-(--avatar-ink-dark)"
        )}
        style={{
          fontSize: fontSize(size, initials),
          "--avatar-ink": ink?.light,
          "--avatar-ink-dark": ink?.dark,
          backgroundImage: generated ? `url(${generated})` : undefined
        }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
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
  return (
    <AvatarGroup className={className} style={{ "--avatar-size": `${size}px` }}>
      {visible.map((subject) => (
        <MemberAvatar key={subject.id} member={subject} size={size} />
      ))}
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
