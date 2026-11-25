import { figmaRefKey, type FigmaRef } from "@pp/shared"
import { useState, type ReactNode } from "react"

import { useVisibleInterval } from "../../hooks/useVisibleInterval"
import {
  useEditorServices,
  type FigmaLinks,
  type TicketTarget
} from "../services"

const MAX_REFRESHES = 15

export const useFigmaMetadata = (
  ref: FigmaRef | null,
  { links, refresh }: FigmaLinks
) => {
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

type MetadataProps = Readonly<{
  reference: FigmaRef | null
  children: (metadata: ReturnType<typeof useFigmaMetadata>) => ReactNode
}>

export function FigmaMetadata({
  target,
  ...props
}: MetadataProps & Readonly<{ target: TicketTarget }>) {
  const { FigmaLinks } = useEditorServices()
  return (
    <FigmaLinks target={target}>
      {(links) => <ResolvedMetadata {...props} links={links} />}
    </FigmaLinks>
  )
}

function ResolvedMetadata({
  reference,
  children,
  links
}: MetadataProps & Readonly<{ links: FigmaLinks }>) {
  return children(useFigmaMetadata(reference, links))
}
