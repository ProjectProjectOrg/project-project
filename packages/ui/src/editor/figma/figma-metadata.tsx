import { figmaRefKey, type FigmaRef } from "@pp/shared"
import { useState } from "react"

import { useVisibleInterval } from "../../hooks/useVisibleInterval"
import { useEditorServices, type TicketTarget } from "../services"

const MAX_REFRESHES = 15

export const useFigmaMetadata = (
  ref: FigmaRef | null,
  target: TicketTarget
) => {
  const { links, refresh } = useEditorServices().useFigmaLinks(target)
  const refKey = ref === null ? null : figmaRefKey(ref)
  const metadata =
    refKey === null || links === null
      ? null
      : (links.find(
          (link) => `${link.fileKey}/${link.nodeId ?? ""}` === refKey
        ) ?? null)

  const pending = refKey !== null && metadata?.lastModified == null
  const [polled, setPolled] = useState({ refKey, count: 0 })
  if (polled.refKey !== refKey) setPolled({ refKey, count: 0 })
  const exhausted = polled.refKey === refKey && polled.count >= MAX_REFRESHES
  useVisibleInterval(
    () => {
      setPolled((current) => ({ ...current, count: current.count + 1 }))
      refresh()
    },
    1_000,
    pending && !exhausted,
    { immediate: true, onFocus: false }
  )

  if (ref === null || links === null) return null
  return metadata
}
