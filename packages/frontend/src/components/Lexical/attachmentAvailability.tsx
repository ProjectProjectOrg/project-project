import { createContext, use, useMemo, type ReactNode } from "react"
import { parseAttachmentUrl } from "@projectproject/shared"

const AttachmentAvailabilityContext = createContext<ReadonlySet<string> | null>(
  null
)

export const attachmentResolves = (
  known: ReadonlySet<string> | null,
  url: string
): boolean => {
  if (known === null) return true
  const ref = parseAttachmentUrl(url)
  return ref === null ? true : known.has(ref.id)
}

export function AttachmentAvailabilityProvider({
  resolvable,
  children
}: {
  resolvable: ReadonlyArray<string> | undefined
  children: ReactNode
}) {
  const known = useMemo(
    () => (resolvable === undefined ? null : new Set(resolvable)),
    [resolvable]
  )
  return (
    <AttachmentAvailabilityContext value={known}>
      {children}
    </AttachmentAvailabilityContext>
  )
}

export const useAttachmentResolves = (url: string): boolean =>
  attachmentResolves(use(AttachmentAvailabilityContext), url)
