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
import { transitions } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  menuItemClass,
  menuSeparatorClass,
  menuSurfaceClass
} from "@pp/ui/menu-styles"
import {
  Timeline,
  TimelineEntry,
  TimelineEvent,
  timelineFoldSeconds
} from "@pp/ui/timeline"
import type { ReactNode } from "react"
import { useCurrentFrame } from "remotion"

import { Fold, Stage, useSettledFrame, type ClipProps } from "../parts/clip"
import { ease, frames, glide, mix, progress } from "../parts/motion"

/*
 * Comment threads, 7 seconds, on the app's own timeline and comment
 * components:
 *
 *   0.3  three replies arrive under a question, one step in
 *   2.4  its "…" menu opens and "Resolve thread" is picked
 *   3.3  the replies in between fold into one row; the last says Resolved
 *   4.2  at rest
 *
 * Moves use the app's own curve (`ease`) over the app's own times, slowed
 * by SLOW so a move reads at video size; the fold itself glides. Heights ease as a share of
 * the content's own (`Fold`), so nothing is measured and nothing jumps.
 */

export const COMMENT_THREADS_FRAMES = 210

const SLOW = 2
// A reply arriving and a thread folding: the timeline's fold.
const FOLD_FRAMES = frames(timelineFoldSeconds * SLOW)
// A menu opening and closing: the app's pop and fade.
const POP_FRAMES = frames(transitions.pop.duration * SLOW)
const FADE_FRAMES = frames(transitions.fade.duration * SLOW)

const BRAM = { id: "u-bram", name: "Bram de Vries" }
const CHIDI = { id: "u-chidi", name: "Chidi Okafor" }
const ANA = { id: "u-ana", name: "Ana Ruiz" }

// Beats, in frames.
const REPLIES = [8, 26, 44] as const
const MENU = 72
const LIT = 84
const PICK = 94
const RESOLVE = 100
// Folding a thread is the big move: a soft start and landing, a little longer.
const RESOLVE_FRAMES = FOLD_FRAMES + 6

const ZOOM = 1.65

// The rail is measured in zoomed pixels, so its SVG undoes the zoom.
const RAIL = `[data-clip-threads] [data-slot="timeline"] > svg { zoom: ${1 / ZOOM}; }
[data-clip-threads] [data-slot="timeline"] > svg path { stroke-width: ${ZOOM}px; }`

function Ago({ children }: Readonly<{ children: string }>) {
  return <time className="text-muted-foreground tabular-nums">{children}</time>
}

// A reply taking or giving up its place, as the app's TimelineAppear does
// it: its space eases open and it rises into place out of a slight blur.
// The gap under it belongs to it, so the gap opens and closes with it.
function Reply({
  open,
  gap = true,
  indent,
  children
}: Readonly<{
  open: number
  gap?: boolean
  // The first reply starts the indent, so the rail's bend eases in with it.
  indent?: boolean
  children: ReactNode
}>) {
  return (
    <Fold open={open}>
      <div
        data-rail-indent={indent ? 22 : undefined}
        className={cn(gap && "pb-2.5")}
        style={{
          opacity: Math.min(1, open * 1.25),
          translate: `0 ${mix(open, 8, 0)}px`,
          filter: open > 0.999 ? undefined : `blur(${mix(open, 2, 0)}px)`
        }}
      >
        {children}
      </div>
    </Fold>
  )
}

export function CommentThreadsClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  useSettledFrame(frame)
  const arrive = REPLIES.map((at) => ease(frame, at, at + FOLD_FRAMES))
  const fold = glide(frame, RESOLVE, RESOLVE + RESOLVE_FRAMES)
  const resolved = ease(frame, RESOLVE + 12, RESOLVE + 12 + FOLD_FRAMES)
  const menuButton =
    progress(frame, MENU - 10, MENU - 4) *
    (1 - progress(frame, PICK + 4, PICK + 4 + FADE_FRAMES))

  return (
    <Stage theme={theme}>
      <style>{RAIL}</style>
      <div
        data-clip-threads=""
        className="relative h-[330px] w-[520px]"
        style={{ zoom: ZOOM, translate: `0 ${fold * 44}px` }}
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
                      frame >= MENU && frame < PICK + 4 ? "" : undefined
                    }
                    style={{ opacity: menuButton }}
                  >
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </Button>
                }
              >
                <p>Should the project export include archived tickets?</p>
              </Comment>
              <CommentReplies className="gap-0">
                <Fold open={fold}>
                  <div className="pb-2.5" style={{ opacity: fold }}>
                    <CommentEarlier
                      label="2 comments from Chidi Okafor, Bram de Vries"
                      open={false}
                      onOpenChange={() => undefined}
                    >
                      {null}
                    </CommentEarlier>
                  </div>
                </Fold>
                <Reply open={arrive[0] * (1 - fold)} indent={frame < RESOLVE}>
                  <Comment
                    mark={<MemberAvatar member={CHIDI} size={20} />}
                    author={CHIDI.name}
                    time={<Ago>yesterday</Ago>}
                  >
                    <p>Yes, with their activity. People search them.</p>
                  </Comment>
                </Reply>
                <Reply open={arrive[1] * (1 - fold)}>
                  <Comment
                    mark={<MemberAvatar member={BRAM} size={20} />}
                    author={BRAM.name}
                    time={<Ago>today</Ago>}
                  >
                    <p>
                      Done on the branch, and the import keeps them archived.
                    </p>
                  </Comment>
                </Reply>
                <Reply open={arrive[2]} gap={false}>
                  <Comment
                    mark={<MemberAvatar member={ANA} size={20} />}
                    author={ANA.name}
                    time={<Ago>just now</Ago>}
                    meta={
                      resolved > 0 ? (
                        // The app's own resolved label (CommentRow).
                        <span
                          className="inline-flex items-center gap-1 text-caption text-state-success"
                          style={{
                            opacity: resolved,
                            translate: `${mix(resolved, -4, 0)}px 0`
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
                </Reply>
              </CommentReplies>
            </CommentThread>
            {/* A node that changes every frame, so the timeline measures its
                rail on each one. */}
            <i key={frame} hidden />
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
// by the frame: it fades and grows out of its button, as the app's does.
function Menu({ frame }: Readonly<{ frame: number }>) {
  const open = ease(frame, MENU, MENU + POP_FRAMES)
  const close = ease(frame, PICK + 4, PICK + 4 + FADE_FRAMES)
  if (open <= 0 || close >= 1) return null
  const lit = ease(frame, LIT, LIT + 4)
  const pressed =
    progress(frame, PICK - 3, PICK) * (1 - progress(frame, PICK, PICK + 4))
  return (
    <div
      className={cn(menuSurfaceClass, "absolute w-56")}
      style={{
        top: 78,
        right: -8,
        opacity: open * (1 - close),
        scale: mix(open, 0.95, 1) * mix(close, 1, 0.97),
        translate: `0 ${mix(open, -8, 0)}px`,
        transformOrigin: "top right"
      }}
    >
      {ITEMS.map((item, index) => {
        const Icon = item.icon
        const picked = "pick" in item
        return (
          <div key={item.label}>
            {index === 1 || index === 2 || index === 3 ? (
              <div className={menuSeparatorClass} />
            ) : null}
            <div
              className={cn(menuItemClass, "relative isolate")}
              data-highlighted={picked && lit > 0.5 ? "" : undefined}
              style={{ scale: picked ? 1 - pressed * 0.03 : 1 }}
            >
              {picked ? (
                <span
                  className="absolute inset-0 -z-10 rounded-[inherit] bg-menu-active [corner-shape:inherit]"
                  style={{ opacity: lit }}
                />
              ) : null}
              <Icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
