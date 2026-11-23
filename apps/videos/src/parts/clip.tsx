import { cn } from "@pp/ui/lib/utils"
import type { ReactNode } from "react"
import { useEffect, useLayoutEffect, useState } from "react"
import { AbsoluteFill, continueRender, delayRender } from "remotion"

export const CLIP = { fps: 30, width: 1280, height: 720 } as const

// Every clip renders once per theme (the render script passes `theme`), so
// the app can play the one that matches the person's theme.
export type ClipTheme = "light" | "dark"
export type ClipProps = Readonly<{ theme: ClipTheme }>
export const CLIP_DEFAULT_PROPS: ClipProps = { theme: "light" }

function useFontsReady() {
  const [handle] = useState(() => delayRender("Loading fonts"))
  useEffect(() => {
    void document.fonts.ready.then(() => continueRender(handle))
  }, [handle])
}

// Frozen frames: a clip is a pure function of its frame, so no CSS
// transition or animation of the real components may run between two.
const STILL = `[data-clip] *, [data-clip] *::before, [data-clip] *::after { transition: none !important; animation: none !important; }`

// Holds each frame until the browser has laid it out and its observers have
// run (the timeline's rail is measured from one), so a frame never shows
// what the frame before it measured.
export function useSettledFrame(frame: number) {
  useLayoutEffect(() => {
    const handle = delayRender(`Settling frame ${frame}`)
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => continueRender(handle))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      continueRender(handle)
    }
  }, [frame])
}

// Something whose height eases between nothing and its own: a grid row of
// `open` fr is that share of its content's height, so nothing is measured
// and nothing jumps. The inner box is what the timeline's rail reads as a
// fold (data-rail-clip).
export function Fold({
  open,
  className,
  children
}: Readonly<{ open: number; className?: string; children: ReactNode }>) {
  return (
    <div
      className="grid"
      style={{ gridTemplateRows: `${Math.max(0, Math.min(1, open))}fr` }}
    >
      <div
        data-rail-clip
        data-rail-indent={0}
        className={cn("min-h-0 overflow-clip", className)}
      >
        {children}
      </div>
    </div>
  )
}

export function Stage({
  theme,
  caption,
  children
}: Readonly<{ theme: ClipTheme; caption?: string; children: ReactNode }>) {
  useFontsReady()
  return (
    <AbsoluteFill
      data-clip=""
      className={cn(
        "items-center justify-center bg-page font-sans text-foreground",
        theme === "dark" && "dark"
      )}
    >
      <style>{STILL}</style>
      <div className="flex h-full w-full items-center justify-center p-16">
        {children}
      </div>
      {caption === undefined ? null : (
        <p className="absolute inset-x-0 bottom-10 text-center text-title text-muted-foreground">
          {caption}
        </p>
      )}
    </AbsoluteFill>
  )
}
