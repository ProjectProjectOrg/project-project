import { Button } from "@pp/ui/button"
import {
  Comment,
  CommentEarlier,
  CommentReplies,
  CommentThread
} from "@pp/ui/comment"
import {
  CircleCheck,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  menuItemClass,
  menuSeparatorClass,
  menuSurfaceClass
} from "@pp/ui/menu-styles"
import { Timeline, TimelineEntry, TimelineEvent } from "@pp/ui/timeline"
import type { ReactNode } from "react"
import { useCurrentFrame } from "remotion"

import { Stage, type ClipProps } from "../parts/clip"
import {
  GLIDE,
  LAND,
  mix,
  POP,
  press,
  progress,
  springAt
} from "../parts/motion"

/*
 * Comment threads, 7 seconds:
 *
 *   0.0  a question on a ticket's timeline
 *   0.4  three replies arrive under it, one step in
 *   2.6  its "…" menu opens and "Resolve thread" is picked
 *   4.0  the replies in between fold into one row, the last one says Resolved
 */

export const COMMENT_THREADS_FRAMES = 210

const BRAM = { id: "u-bram", name: "Bram de Vries" }
const CHIDI = { id: "u-chidi", name: "Chidi Okafor" }
const ANA = { id: "u-ana", name: "Ana Ruiz" }

// Beats, in frames.
const REPLIES = [12, 34, 56] as const
const MENU = 80
const PICK = 112
const FOLD = 122

const ZOOM = 1.65

// Frozen frames: no CSS transition or animation may run between them. The
// rail is measured in zoomed pixels, so its SVG undoes the zoom.
const STILL = `[data-clip="threads"] *, [data-clip="threads"] *::before, [data-clip="threads"] *::after { transition: none !important; animation: none !important; }
[data-clip="threads"] [data-slot="timeline"] > svg { zoom: ${1 / ZOOM}; }
[data-clip="threads"] [data-slot="timeline"] > svg path { stroke-width: ${ZOOM}px; }`

function Ago({ children }: Readonly<{ children: string }>) {
  return <time className="text-muted-foreground tabular-nums">{children}</time>
}

// Something arriving or leaving: its space eases open, it rises into place.
function Rise({
  t,
  height,
  children
}: Readonly<{ t: number; height: number; children: ReactNode }>) {
  // Gone entirely while closed, so the rail doesn't bend in to it.
  if (t < 0.001) return null
  return (
    <div
      className="overflow-clip"
      style={{
        maxHeight: mix(t, 0, height),
        marginTop: mix(t, -10, 0),
        opacity: Math.min(1, t * 1.4)
      }}
    >
      <div
        style={{
          translate: `0 ${(1 - t) * 8}px`,
          filter: `blur(${(1 - t) * 2}px)`
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function CommentThreadsClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  const arrive = REPLIES.map((at) => springAt(frame, at, GLIDE, 14))
  const fold = springAt(frame, FOLD, GLIDE, 16)
  const resolved = springAt(frame, FOLD + 10, POP)
  const menuButton = progress(frame, MENU - 14, MENU - 8)

  return (
    <Stage theme={theme} caption="">
      <style>{STILL}</style>
      <div
        data-clip="threads"
        className="relative h-[340px] w-[520px]"
        style={{ zoom: ZOOM }}
      >
        <Timeline>
          <TimelineEvent
            mark={<MemberAvatar member={ANA} size={20} />}
            actor={
              <span className="font-semibold text-foreground">Ana Ruiz</span>
            }
            time={<Ago>2 days ago</Ago>}
          >
            created this
          </TimelineEvent>
          <TimelineEntry>
            <CommentThread>
              <Comment
                mark={<MemberAvatar member={BRAM} size={20} />}
                author={BRAM.name}
                time={<Ago>yesterday</Ago>}
                actions={
                  <Button
                    variant="ghost"
                    size="square-7"
                    tabIndex={-1}
                    data-popup-open={
                      frame >= MENU && frame < PICK + 6 ? "" : undefined
                    }
                    style={{
                      opacity:
                        menuButton * (1 - progress(frame, PICK + 6, PICK + 12))
                    }}
                  >
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </Button>
                }
              >
                <p>Should the project export include archived tickets?</p>
              </Comment>
              <CommentReplies>
                {fold > 0.001 ? (
                  <Rise t={fold} height={24}>
                    <CommentEarlier
                      label="2 comments from Chidi Okafor, Bram de Vries"
                      open={false}
                      onOpenChange={() => undefined}
                    >
                      {null}
                    </CommentEarlier>
                  </Rise>
                ) : null}
                <Rise t={arrive[0] * (1 - fold)} height={80}>
                  <Comment
                    mark={<MemberAvatar member={CHIDI} size={20} />}
                    author={CHIDI.name}
                    time={<Ago>yesterday</Ago>}
                  >
                    <p>Yes, with their activity. People search them.</p>
                  </Comment>
                </Rise>
                <Rise t={arrive[1] * (1 - fold)} height={80}>
                  <Comment
                    mark={<MemberAvatar member={BRAM} size={20} />}
                    author={BRAM.name}
                    time={<Ago>today</Ago>}
                  >
                    <p>
                      Done on the branch, and the import keeps them archived.
                    </p>
                  </Comment>
                </Rise>
                <Rise t={arrive[2]} height={80}>
                  <Comment
                    mark={<MemberAvatar member={ANA} size={20} />}
                    author={ANA.name}
                    time={<Ago>just now</Ago>}
                    meta={
                      frame >= FOLD + 8 ? (
                        <span
                          className="inline-flex items-center gap-1 text-caption text-state-success"
                          style={{
                            scale: mix(resolved, 0.6, 1),
                            opacity: Math.min(1, resolved * 2)
                          }}
                        >
                          <CircleCheck className="size-3.5" strokeWidth={2} />
                          Resolved
                        </span>
                      ) : undefined
                    }
                  >
                    <p>Checked it on a copy of our data. Looks right.</p>
                  </Comment>
                </Rise>
              </CommentReplies>
            </CommentThread>
          </TimelineEntry>
        </Timeline>
        <Menu frame={frame} />
      </div>
    </Stage>
  )
}

const ITEMS = [
  { icon: Pencil, label: "Edit" },
  { icon: CircleCheck, label: "Resolve thread", pick: true },
  { icon: Plus, label: "Create ticket from comment" },
  { icon: Link2, label: "Copy link" },
  { icon: FileText, label: "Copy thread as markdown" }
] as const

// The comment's menu, drawn from the menu's own classes so it can be driven
// by the frame.
function Menu({ frame }: Readonly<{ frame: number }>) {
  if (frame < MENU || frame > PICK + 8) return null
  const open = springAt(frame, MENU, LAND)
  const close = progress(frame, PICK + 2, PICK + 8)
  const lit = frame >= PICK - 14
  return (
    <div
      className={cn(menuSurfaceClass, "absolute w-56")}
      style={{
        top: 78,
        right: -8,
        opacity: Math.min(1, open * 2) * (1 - close),
        scale: mix(open, 0.95, 1) * mix(close, 1, 0.97),
        transformOrigin: "top right"
      }}
    >
      {ITEMS.map((item, index) => {
        const Icon = item.icon
        const picked = "pick" in item && lit
        return (
          <div key={item.label}>
            {index === 1 || index === 2 || index === 3 ? (
              <div className={menuSeparatorClass} />
            ) : null}
            <div
              className={cn(menuItemClass, picked && "bg-menu-active")}
              data-highlighted={picked ? "" : undefined}
              style={{ scale: picked ? press(frame, PICK - 4, 0.97, 8) : 1 }}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
