import { createContext, use, useMemo, type ReactNode } from "react"
import { parseAttachmentUrl } from "@projectproject/shared"

const AttachmentMissingContext = createContext<ReadonlySet<string> | null>(null)

export const attachmentResolves = (
  missing: ReadonlySet<string> | null,
  url: string
): boolean => {
  if (missing === null) return true
  const ref = parseAttachmentUrl(url)
  return ref === null ? true : !missing.has(ref.id)
}

export function AttachmentAvailabilityProvider({
  missing,
  children
}: {
  missing: ReadonlyArray<string> | undefined
  children: ReactNode
}) {
  const known = useMemo(
    () => (missing === undefined ? null : new Set(missing)),
    [missing]
  )
  return (
    <AttachmentMissingContext value={known}>
      {children}
    </AttachmentMissingContext>
  )
}

export const useAttachmentResolves = (url: string): boolean =>
  attachmentResolves(use(AttachmentMissingContext), url)
