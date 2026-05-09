import { createContext, useContext, type ReactNode } from "react"
import type { Member } from "@projectproject/shared"

export interface MentionScope {
  orgSlug: string
  slug: string
  members?: ReadonlyArray<Member>
}

const Ctx = createContext<MentionScope | null>(null)

export const MentionScopeProvider = ({
  scope,
  children
}: {
  scope: MentionScope
  children: ReactNode
}) => <Ctx.Provider value={scope}>{children}</Ctx.Provider>

export const useMentionScope = (): MentionScope | null => useContext(Ctx)
