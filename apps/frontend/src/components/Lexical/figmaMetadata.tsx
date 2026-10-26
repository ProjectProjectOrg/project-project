import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { figmaRefKey, type FigmaRef } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useRef } from "react"

import {
  figmaTicketLinksAtom,
  type FigmaTicketLinksRequest
} from "@/features/figma/atoms/figma"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

const MAX_REFRESHES = 15

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

  const pending = refKey !== null && metadata?.lastModified == null
  const attempts = useRef({ refKey, count: 0 })
  useVisibleInterval(
    () => {
      if (attempts.current.refKey !== refKey) {
        attempts.current = { refKey, count: 0 }
      }
      if (attempts.current.count >= MAX_REFRESHES) return
      attempts.current.count += 1
      refresh()
    },
    1_000,
    pending,
    { immediate: true, onFocus: false }
  )

  if (ref === null || !AsyncResult.isSuccess(result)) return null
  return metadata
}
