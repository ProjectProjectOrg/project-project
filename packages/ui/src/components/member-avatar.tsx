import { useMemo } from "react"

import { avatarInitials, orbAvatar } from "../lib/orbAvatar"
import { orbAvatarUrl } from "../lib/orbAvatar"
import { cn } from "../lib/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage
} from "./avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export type AvatarSubject = Readonly<{
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}>

// Below this size initials on a dithered orb read as noise, so the
// orb shows alone and the member's name must sit next to it.
const INITIALS_MIN_SIZE = 24

const fontSize = (size: number, initials: string) =>
  Math.max(8, Math.round(size * (initials.length > 1 ? 0.34 : 0.44)))

/**
 * A member's photo, or their generated orb. Pass `label` (usually the
 * member's name) when the avatar stands alone; leave it out when the name is
 * already next to it or the avatar sits inside a labelled control, and the
 * avatar is hidden from assistive tech.
 *
 * Initials are drawn with generated content rather than text, so they never
 * leak into the accessible name of a button that wraps the avatar.
 */
export function MemberAvatar({
  member,
  size = 20,
  label,
  className
}: {
  member: AvatarSubject
  size?: number
  label?: string
  className?: string
}) {
  const initials =
    size >= INITIALS_MIN_SIZE
      ? avatarInitials(member.name, member.email, size)
      : ""
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
      {...(label === undefined
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
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
        data-initials={initials}
        className={cn(
          "before:content-[attr(data-initials)]",
          ink &&
            "bg-transparent bg-cover font-bold text-(--avatar-ink) dark:text-(--avatar-ink-dark)"
        )}
        style={{
          fontSize: fontSize(size, initials),
          "--avatar-ink": ink?.light,
          "--avatar-ink-dark": ink?.dark,
          backgroundImage: generated ? `url(${generated})` : undefined
        }}
      />
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
        // The count names the people it stands for on hover and focus.
        <Tooltip>
          <TooltipTrigger
            render={
              <AvatarGroupCount
                className="focus-ring"
                style={{
                  width: size,
                  height: size,
                  fontSize: Math.max(10, Math.round(size * 0.42))
                }}
              />
            }
          >
            +{overflow}
          </TooltipTrigger>
          <TooltipContent>
            <ul className="grid gap-1 py-0.5">
              {subjects.slice(max).map((subject) => (
                <li key={subject.id} className="flex items-center gap-1.5">
                  <MemberAvatar member={subject} size={16} />
                  {subject.name ?? subject.email}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </AvatarGroup>
  )
}
