import { cn } from "@pp/ui/lib/utils"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
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

export function Stage({
  theme,
  caption,
  children
}: Readonly<{ theme: ClipTheme; caption: string; children: ReactNode }>) {
  useFontsReady()
  return (
    <AbsoluteFill
      className={cn(
        "items-center justify-center bg-page font-sans text-foreground",
        theme === "dark" && "dark"
      )}
    >
      <div className="flex h-full w-full items-center justify-center p-16">
        {children}
      </div>
      <p className="absolute inset-x-0 bottom-10 text-center text-title text-muted-foreground">
        {caption}
      </p>
    </AbsoluteFill>
  )
}
