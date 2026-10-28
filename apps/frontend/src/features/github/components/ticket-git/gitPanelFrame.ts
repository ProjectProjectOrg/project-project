import type { GithubConnection, TicketDetail } from "@pp/shared"

export type GitPanelFrame = Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate: string | null
  variant: "bordered" | "ghost"
  canWrite: boolean
  repoSlug: string
  pulse: string | false
  panelChrome: string | undefined
}>

export const PANEL_CHROME =
  "rounded-lg border border-border bg-background px-3 py-2"
