import { createContext, useContext, type ReactNode } from "react"

export interface MentionScope {
  orgSlug: string
  slug: string
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
