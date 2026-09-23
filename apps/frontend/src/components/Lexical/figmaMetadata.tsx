import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { figmaRefKey, type FigmaRef } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useEffect } from "react"

import {
  figmaTicketLinksAtom,
  type FigmaTicketLinksRequest
} from "@/features/figma/atoms/figma"

export interface FigmaLinkMetadata {
  readonly name: string
  readonly fileName: string
  readonly thumbnailUrl: string | null
}

export const useFigmaMetadata = (
  ref: FigmaRef | null,
  request: FigmaTicketLinksRequest
): FigmaLinkMetadata | null => {
  const links = figmaTicketLinksAtom(request)
  const result = useAtomValue(links)
  const refresh = useAtomRefresh(links)
  const refKey = ref === null ? null : figmaRefKey(ref)
  const metadata =
    refKey === null || !AsyncResult.isSuccess(result)
      ? null
      : (result.value.find(
          (link) => `${link.fileKey}/${link.nodeId ?? ""}` === refKey
        ) ?? null)

  useEffect(() => {
    if (refKey === null || metadata?.lastModified != null) return
    let attempts = 0
    let interval: number | undefined
    const refreshIfVisible = () => {
      if (attempts >= 15) return
      if (document.visibilityState !== "visible") return
      attempts += 1
      refresh()
      if (attempts >= 15) {
        window.clearInterval(interval)
        document.removeEventListener("visibilitychange", refreshIfVisible)
      }
    }
    refreshIfVisible()
    if (attempts < 15) interval = window.setInterval(refreshIfVisible, 1_000)
    document.addEventListener("visibilitychange", refreshIfVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshIfVisible)
    }
  }, [metadata?.lastModified, refKey, refresh])

  if (ref === null || !AsyncResult.isSuccess(result)) return null
  return metadata
}
