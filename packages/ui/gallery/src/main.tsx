import { preloadHighlighter } from "@pierre/diffs"
import { TooltipProvider } from "@pp/ui/tooltip"
import { MotionConfig } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import { mirrorForcedStates } from "./forcedStates"

import "./styles.css"

mirrorForcedStates()

await preloadHighlighter({
  themes: ["pierre-light", "pierre-dark"],
  langs: ["tsx", "css"]
})

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
