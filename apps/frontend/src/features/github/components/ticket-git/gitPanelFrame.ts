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
  buttonSize: "sm" | "xs"
}>

export const PANEL_CHROME =
  "rounded-lg border border-border bg-background px-3 py-2"
export const GIT_PANEL_CONTAINER = "@container/git-panel"
export const IDLE_STACK =
  "@max-sm/git-panel:flex-col @max-sm/git-panel:items-stretch"
export const ACTIONS_STACK =
  "@max-sm/git-panel:ml-0 @max-3xs/git-panel:flex-col @max-3xs/git-panel:items-stretch"
export const ROW_STACK =
  "flex flex-wrap items-center gap-2 @max-sm/git-panel:flex-col @max-sm/git-panel:items-start"
export const WRAPPABLE_TEXT =
  "min-w-0 truncate text-xs text-muted-foreground @max-sm/git-panel:whitespace-normal @max-sm/git-panel:overflow-visible"
