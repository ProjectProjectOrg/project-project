import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion
} from "motion/react"
import { useMemo } from "react"

import { avatarInitials, orbAvatar } from "../lib/orbAvatar"
import { orbAvatarUrl } from "../lib/orbAvatar"
import { transitions } from "../lib/springs"
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
  countTooltip = true,
  animated = false,
  overlap,
  className
}: {
  subjects: ReadonlyArray<AvatarSubject>
  size?: number
  max?: number
  // The "+N" names the people it stands for in a tooltip. Turn it off when
  // the stack sits inside a control that has a tooltip of its own (a
  // selection bar field): a trigger can't nest in a button.
  countTooltip?: boolean
  // People joining or leaving the stack grow and fade in and out instead
  // of popping (a selection bar, where the stack follows the selection).
  animated?: boolean
  // How far each avatar tucks under the one before it, in px (8 unless the
  // className sets --avatar-overlap).
  overlap?: number
  className?: string
}) {
  const visible = subjects.slice(0, max)
  const overflow = subjects.length - visible.length
  const scale = (useReducedMotion() ?? false) ? 1 : 0.6
  const style: React.CSSProperties = { "--avatar-size": `${size}px` }
  if (overlap !== undefined) style["--avatar-overlap"] = `${overlap}px`
  return (
    <AvatarGroup
      className={className}
      style={style}
      data-animated={animated || undefined}
    >
      {animated ? (
        <AnimatePresence initial={false}>
          {visible.map((subject, index) => (
            <StackedAvatar
              key={subject.id}
              subject={subject}
              size={size}
              offset={index === 0 ? 0 : -(overlap ?? 8)}
              scale={scale}
            />
          ))}
        </AnimatePresence>
      ) : (
        visible.map((subject) => (
          <MemberAvatar key={subject.id} member={subject} size={size} />
        ))
      )}
      {overflow > 0 && !countTooltip && (
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
      {overflow > 0 &&
        countTooltip && (
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

// One avatar of an animated stack: it grows in and shrinks out, and while it
// leaves it says so (data-leaving), so the avatar before it lets go of the
// cutout it kept for it (theme.css).
function StackedAvatar({
  subject,
  size,
  offset,
  scale
}: Readonly<{
  subject: AvatarSubject
  size: number
  offset: number
  scale: number
}>) {
  const present = useIsPresent()
  return (
    <motion.span
      data-leaving={present ? undefined : ""}
      initial={{ opacity: 0, scale, width: 0, marginInlineStart: 0 }}
      animate={{ opacity: 1, scale: 1, width: size, marginInlineStart: offset }}
      exit={{ opacity: 0, scale, width: 0, marginInlineStart: 0 }}
      transition={transitions.morph}
      className="flex shrink-0"
    >
      <MemberAvatar member={subject} size={size} />
    </motion.span>
  )
}
