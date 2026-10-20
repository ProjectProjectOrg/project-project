import { CircleCheck, CircleDashed, GitBranch, Timer } from "lucide-react"
import type { ReactNode } from "react"

import { AttachmentChip } from "@/components/AttachmentChip"
import { FigmaGlyph } from "@/components/Lexical/FigmaChip"
import type { IntegrationKind } from "@/components/settings/IntegrationLogo"
import { PrLink } from "@/components/TicketGit"
import { formatClock } from "@/components/time/RunningTimerIndicator"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/duration"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const EXAMPLE = {
  branch: "proj-42-checkout-redirect",
  screenshot: "checkout-error.png",
  log: "crash-log.txt",
  sender: "invites@acme.dev"
} as const

export function IntegrationPreview({
  kind
}: Readonly<{ kind: IntegrationKind }>) {
  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none flex h-28 flex-col gap-2 overflow-hidden rounded-md bg-muted/70 [mask-image:linear-gradient(to_bottom,black_70%,transparent)] px-2.5 py-2 text-xs transition-colors select-none group-hover/reveal:bg-muted dark:bg-background/60 dark:group-hover/reveal:bg-background"
    >
      {kind === "github" ? (
        <GithubScene />
      ) : kind === "storage" ? (
        <StorageScene />
      ) : kind === "email" ? (
        <EmailScene />
      ) : kind === "everhour" ? (
        <EverhourScene />
      ) : (
        <FigmaScene />
      )}
    </div>
  )
}

function TicketLine({
  id,
  title,
  done = false
}: Readonly<{ id: string; title: string; done?: boolean }>) {
  const Icon = done ? CircleCheck : CircleDashed
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          done ? "text-state-success" : "text-muted-foreground"
        )}
        strokeWidth={1.75}
      />
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {id}
      </span>
      <span className="truncate text-foreground/90">{title}</span>
    </span>
  )
}

function Indented({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 pl-5">{children}</span>
  )
}

function GithubScene() {
  return (
    <>
      <TicketLine id="PROJ-42" title={m.org_integrations_preview_ticket_a()} />
      <Indented>
        <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{EXAMPLE.branch}</span>
        </span>
        <PrLink number={128} url="#" tone="open" checks="passing" />
      </Indented>
      <TicketLine
        id="PROJ-38"
        title={m.org_integrations_preview_ticket_b()}
        done
      />
      <Indented>
        <PrLink number={121} url="#" tone="merged" />
      </Indented>
    </>
  )
}

function StorageScene() {
  return (
    <>
      <TicketLine id="PROJ-42" title={m.org_integrations_preview_ticket_a()} />
      <span className="flex flex-col items-start gap-1 pl-4">
        <AttachmentChip
          variant="linked"
          kind="image"
          url=""
          alt=""
          filename={EXAMPLE.screenshot}
          morphId="integration-preview-screenshot"
        />
        <AttachmentChip
          variant="linked"
          kind="file"
          url=""
          alt=""
          filename={EXAMPLE.log}
          morphId="integration-preview-log"
        />
      </span>
    </>
  )
}

function EmailScene() {
  return (
    <span className="flex flex-col gap-1 rounded-md border border-border bg-card p-2">
      <span className="truncate text-[11px] text-muted-foreground">
        {EXAMPLE.sender}
      </span>
      <span className="truncate font-medium">
        {m.org_integrations_preview_email_subject()}
      </span>
      <span className="truncate text-muted-foreground">
        {m.org_integrations_preview_email_body()}
      </span>
      <Button size="xs" render={<span />} className="mt-1 w-fit">
        {m.org_integrations_preview_email_button()}
      </Button>
    </span>
  )
}

function EverhourScene() {
  return (
    <>
      <span className="flex w-fit max-w-full min-w-0 items-center gap-2 rounded-lg bg-accent/60 px-2 py-1">
        <Timer
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <span className="truncate">
          {m.org_integrations_preview_timer_label()}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatClock(5050)}
        </span>
      </span>
      <span className="flex items-center gap-5 pl-1 tabular-nums">
        <Figure label={m.time_estimated()} seconds={3 * 3600} />
        <Figure label={m.time_tracked_total()} seconds={5040} />
      </span>
    </>
  )
}

function Figure({
  label,
  seconds
}: Readonly<{ label: string; seconds: number }>) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] whitespace-nowrap text-muted-foreground">
        {label}
      </span>
      <span className="text-[13px] font-medium">{formatDuration(seconds)}</span>
    </span>
  )
}

function FigmaScene() {
  return (
    <span className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
      <span className="flex items-center gap-1.5 border-b border-border px-2 py-1 text-[11px]">
        <FigmaGlyph className="h-3" />
        <span className="truncate">
          {m.org_integrations_preview_figma_frame()}
        </span>
      </span>
      <span className="grid grid-cols-[3fr_2fr] gap-2 p-2">
        <span className="flex flex-col gap-1.5">
          <span className="h-1.5 w-3/4 rounded-full bg-foreground/25" />
          <span className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
          <span className="h-1.5 w-2/3 rounded-full bg-foreground/15" />
          <span className="mt-1 h-4 w-16 rounded bg-[#A259FF]/50" />
        </span>
        <span className="h-14 rounded bg-gradient-to-br from-[#1ABCFE]/40 to-[#0ACF83]/40" />
      </span>
    </span>
  )
}
