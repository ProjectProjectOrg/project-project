import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage
} from "@/components/ui/avatar"
import { avatarColor } from "@/features/members/lib/avatarColor"
import { cn } from "@/lib/utils"

export type AvatarSubject = Readonly<{
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}>

const fontSize = (size: number) => Math.max(10, Math.round(size * 0.5))

export function MemberAvatar({
  member,
  size = 20,
  className
}: {
  member: AvatarSubject
  size?: number
  className?: string
}) {
  const initial = (member.name || member.email || "?").charAt(0).toUpperCase()
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
        className={cn(!member.image && "text-foreground dark:text-background")}
        style={{
          fontSize: fontSize(size),
          backgroundColor: member.image
            ? undefined
            : avatarColor(member.id).oklch
        }}
      >
        {initial}
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
    <AvatarGroup className={className}>
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
