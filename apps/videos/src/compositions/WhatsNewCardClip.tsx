import { ItemLink } from "@pp/ui/item-link"
import { transitions } from "@pp/ui/lib/springs"
import { SidebarCard } from "@pp/ui/sidebar"
import { OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion"

import { AppWindow, SETTLED } from "../parts/app-window"
import { Stage, type ClipProps } from "../parts/clip"
import { ease, frames, glide, mix } from "../parts/motion"

/*
 * The What's new card, 6 seconds: the app's own card (WhatsNewCard in
 * apps/frontend: a SidebarCard whose media is the release's headline video)
 * as it shows under the sidebar's rows after an upgrade.
 *
 *   0.6  the card rises in under the panel's rows, its video playing
 *   1.5  the view moves in on the card
 *   3.0  at rest on the card
 */

export const WHATS_NEW_CARD_FRAMES = 180

// The release this card announces, as `releaseMeta` writes it, and its
// highlights, which are the card's lines (`previewLines`).
const META = "v2026.11.23 · Nov 23, 2026"
const HEADLINE = "redesign"
const LINES = [
  "A new look for the whole app",
  "Reply to a comment in a thread, and resolve the thread when it's settled",
  "A card at the bottom of the sidebar shows what changed since your last visit"
] as const

// Beats, in frames.
const CARD = 18
const MOVE_IN = 44
const MOVE_FRAMES = 46
// The card's own entrance (SidebarCard: transitions.presence), slowed to
// read at video size.
const CARD_FRAMES = frames(transitions.presence.duration * 2.5)

const noop = () => undefined

export function WhatsNewCardClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  const enter = ease(frame, CARD, CARD + CARD_FRAMES)
  const move = glide(frame, MOVE_IN, MOVE_IN + MOVE_FRAMES)

  return (
    <Stage theme={theme}>
      <div
        style={{
          // Ends with the whole card in view, a little left of the middle.
          scale: mix(move, 1, 1.6),
          transformOrigin: "-18px 523px"
        }}
      >
        <AppWindow
          frame={SETTLED}
          footer={
            <div
              style={{
                opacity: enter,
                translate: `0 ${mix(enter, 8, 0)}px`
              }}
            >
              <SidebarCard
                open
                title="What's new"
                meta={META}
                media={
                  // ChangelogVideo's frame and picture, playing the rendered
                  // headline clip of this theme.
                  <div className="relative overflow-hidden rounded-[inherit] [corner-shape:inherit] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-(--tooltip-edge) after:[corner-shape:inherit]">
                    <Sequence from={CARD} layout="none">
                      <OffthreadVideo
                        src={staticFile(`${HEADLINE}.${theme}.mp4`)}
                        muted
                        className="block aspect-video w-full bg-muted object-cover"
                      />
                    </Sequence>
                  </div>
                }
                link={<ItemLink aria-label="Full changelog" />}
                dismissLabel="Dismiss what's new"
                onDismiss={noop}
              >
                {/* WhatsNewBody, as the app writes it. */}
                <div className="flex flex-col gap-2">
                  <ul className="flex flex-col gap-1 text-caption text-foreground">
                    {LINES.map((line) => (
                      <li key={line} className="text-pretty">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <span
                    aria-hidden
                    className="text-caption font-semibold text-foreground underline-offset-2"
                  >
                    Full changelog
                  </span>
                </div>
              </SidebarCard>
            </div>
          }
        />
      </div>
    </Stage>
  )
}
