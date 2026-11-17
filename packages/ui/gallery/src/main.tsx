import { preloadHighlighter } from "@pierre/diffs"
import { TooltipProvider } from "@pp/ui/tooltip"
import { MotionConfig } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import { mirrorForcedStates } from "./forcedStates"
import { preloadPath } from "./registry"

import "./styles.css"

mirrorForcedStates()

// The first render waits for the page and its demos, so it shows in full
// behind the boot loader instead of filling in after.
await Promise.all([
  preloadHighlighter({
    themes: ["pierre-light", "pierre-dark"],
    langs: ["tsx", "css"]
  }),
  preloadPath(window.location.pathname)
])

const root = document.getElementById("root")
if (root !== null)
  createRoot(root).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </MotionConfig>
    </StrictMode>
  )
