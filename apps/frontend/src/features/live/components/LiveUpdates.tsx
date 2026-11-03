import { useAtomMount } from "@effect/atom-react"

import { useHoldDuringDrags } from "@/hooks/useHoldDuringDrags"

import { liveUpdates } from "../atoms/liveUpdates"
import { useDocumentVisible } from "../hooks/useDocumentVisible"

export function LiveUpdates() {
  useHoldDuringDrags()
  return useDocumentVisible() ? <LiveConnection /> : null
}

function LiveConnection() {
  useAtomMount(liveUpdates)
  return null
}
