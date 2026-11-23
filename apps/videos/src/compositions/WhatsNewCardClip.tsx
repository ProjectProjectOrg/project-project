import { SidebarCard } from "@pp/ui/sidebar"
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { Stage, type ClipProps } from "../parts/clip"

const ROWS = ["Overview", "All projects", "Settings", "Sprint 25", "Roadmap"]

export function WhatsNewCardClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = interpolate(frame, [fps * 0.8, fps * 1.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  })
  const zoom = interpolate(frame, [fps * 2.5, fps * 4], [1, 1.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  })

  return (
    <Stage theme={theme} caption="What changed, at the bottom of the sidebar">
      <div
        className="flex h-[520px] w-[760px] overflow-hidden rounded-[22px] bg-background shadow-(--tooltip-edge) [corner-shape:var(--button-corner)]"
        style={{ transform: `scale(${zoom})`, transformOrigin: "18% 92%" }}
      >
        <div className="flex w-59 flex-col py-2">
          <p className="px-4 pb-3 text-subtitle font-semibold">Acme</p>
          {ROWS.map((row) => (
            <p
              key={row}
              className="px-4 py-1.5 text-body text-muted-foreground"
            >
              {row}
            </p>
          ))}
          <div
            className="mt-auto"
            style={{
              opacity: enter,
              transform: `translateY(${(1 - enter) * 8}px)`
            }}
          >
            <SidebarCard
              open
              title="What's new"
              meta="v2026.11.20 · Nov 20, 2026"
              dismissLabel="Dismiss"
              onDismiss={() => undefined}
            >
              <ul className="flex flex-col gap-1 text-foreground">
                <li>A card at the bottom of the sidebar shows what changed</li>
                <li>Long descriptions no longer jump while you type</li>
              </ul>
              <p className="mt-2 text-caption font-semibold text-foreground">
                Full changelog
              </p>
            </SidebarCard>
          </div>
        </div>
        <div className="m-2 ml-0 flex-1 rounded-[16px] bg-page" />
      </div>
    </Stage>
  )
}
