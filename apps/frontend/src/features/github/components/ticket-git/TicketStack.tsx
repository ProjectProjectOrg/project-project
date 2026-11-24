import { useAtomSet } from "@effect/atom-react"
import type {
  ChecksStatus,
  GitState,
  GithubConnection,
  StackLayerState,
  TicketDetail
} from "@pp/shared"
import { Layers } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MiddleTruncate } from "@pp/ui/middle-truncate"
import * as Exit from "effect/Exit"
import { useMemo, useState } from "react"

import { unstackBranch } from "@/features/github/atoms/github"
import { BranchMenuRemoval } from "@/features/github/lib/branchMenuRemoval"
import { compareUrl } from "@/features/github/lib/branchUrl"
import { repoSlug } from "@/features/github/lib/repos"
import {
  stackPullRequestCount,
  ownLayer,
  layerTone,
  TONES
} from "@/features/github/lib/stackPresentation"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { BranchMenu } from "./BranchMenu"
import { PANEL_CHROME } from "./gitPanelFrame"

const CHECKS = {
  failing: {
    label: m.git_stack_checks_failing,
    className: "text-state-danger"
  },
  pending: {
    label: m.git_stack_checks_pending,
    className: "text-state-warning"
  }
} as const

const checksNote = (checks: ChecksStatus | null) =>
  checks === "failing" || checks === "pending" ? CHECKS[checks] : undefined

export function StackedBranches({
  ticket,
  github,
  own,
  stack,
  pulse,
  variant
}: Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  own: GitState
  stack: ReadonlyArray<StackLayerState>
  pulse: boolean
  variant: "bordered" | "ghost"
}>) {
  const canWrite = useProjectActor().call("tickets", "stackBranch")
  const bottom = ownLayer(own, ticket, github.defaultBaseBranch ?? "main")
  const rows = bottom === null ? stack : [bottom, ...stack]
  const count = stackPullRequestCount(own, stack)
  return (
    <div className={variant === "bordered" ? PANEL_CHROME : undefined}>
      <section
        className="flex flex-col gap-1.5"
        aria-label={m.git_stack_heading()}
      >
        <ul className="flex flex-col">
          {rows.map((layer, index) => (
            <StackLayerRow
              key={layer.branch}
              ticket={ticket}
              github={github}
              layer={layer}
              previousBranch={rows[index - 1]?.branch ?? null}
              first={index === 0}
              last={index === rows.length - 1}
              own={layer === bottom}
              pulse={layer === bottom && pulse}
              repoSlug={repoSlug(github)}
              canWrite={canWrite}
            />
          ))}
        </ul>
        <span
          className="inline-flex items-center gap-1 text-micro text-muted-foreground"
          title={m.git_stack_count_title(count)}
        >
          <Layers className="size-3" aria-hidden />
          {m.git_stack_count(count)}
        </span>
      </section>
    </div>
  )
}

function StackLayerRow({
  ticket,
  github,
  layer,
  previousBranch,
  first,
  last,
  own,
  pulse,
  repoSlug,
  canWrite
}: Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  layer: StackLayerState
  previousBranch: string | null
  first: boolean
  last: boolean
  own: boolean
  pulse: boolean
  repoSlug: string
  canWrite: boolean
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const tone = layerTone(layer)
  const { icon: Icon, className, label: toneLabel } = TONES[tone]
  const label = toneLabel()
  const title = layer.pr?.title ?? ""
  const request = useMemo(
    () => ({ req: projectRequest(orgSlug, slug), id: ticket.id }),
    [orgSlug, slug, ticket.id]
  )
  const remove = useAtomSet(unstackBranch(request), { mode: "promiseExit" })
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onRemove() {
    setBusy(true)
    setFailed(false)
    const exit = await remove({ name: layer.branch }).finally(() =>
      setBusy(false)
    )
    if (Exit.isFailure(exit)) setFailed(true)
  }

  return (
    <li
      className={cn(
        "relative flex items-start gap-2 py-1.5",
        pulse && "animate-pulse"
      )}
    >
      {!first && (
        <span
          aria-hidden
          className="absolute top-0 left-[6.5px] h-1.5 w-px bg-border"
        />
      )}
      {!last && (
        <span
          aria-hidden
          className="absolute top-6 bottom-0 left-[6.5px] w-px bg-border"
        />
      )}
      <span title={label} className="mt-0.5">
        <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5 text-caption">
          {layer.pr !== null && (
            <a
              href={layer.pr.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 font-semibold hover:underline"
            >
              #{layer.pr.number}
            </a>
          )}
          <span
            className={cn("min-w-0 truncate", title === "" && "tabular-nums")}
            title={layer.branch}
          >
            {title === "" ? layer.branch : title}
          </span>
        </div>
        <StackLayerMeta layer={layer} previousBranch={previousBranch} />
        {failed && (
          <p role="alert" className="text-micro text-destructive">
            {m.git_stack_remove_error()}
          </p>
        )}
      </div>
      <BranchMenu
        ticket={ticket}
        github={github}
        branch={layer.branch}
        openPr={canWrite ? openPullRequest(layer, repoSlug) : null}
        removal={
          own
            ? BranchMenuRemoval.ticket()
            : BranchMenuRemoval.stack({ busy, onRemove: () => void onRemove() })
        }
      />
    </li>
  )
}

function openPullRequest(layer: StackLayerState, repo: string) {
  if (layer.base === null || (layer.pr !== null && layer.pr.state !== "closed"))
    return null
  return {
    href: compareUrl(repo, layer.base, layer.branch),
    label:
      layer.pr === null ? m.git_open_pr_button() : m.git_open_new_pr_button()
  }
}

function StackLayerMeta({
  layer,
  previousBranch
}: Readonly<{ layer: StackLayerState; previousBranch: string | null }>) {
  const tone = layerTone(layer)
  const { className, label: toneLabel } = TONES[tone]
  const label = toneLabel()
  const checks = checksNote(layer.pr?.checks ?? null)
  const title = layer.pr?.title ?? ""
  const showBase = layer.base !== null && layer.base !== previousBranch
  const notes = [
    ...(tone === "none" || tone === "deleted"
      ? [{ text: label, className }]
      : []),
    ...(checks ? [{ text: checks.label(), className: checks.className }] : [])
  ]
  const hasMeta = title !== "" || showBase || notes.length > 0

  return hasMeta ? (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-micro text-muted-foreground">
      {title !== "" && (
        <MiddleTruncate value={layer.branch} className="tabular-nums" />
      )}
      {showBase && (
        <span className="truncate tabular-nums">
          {m.git_stack_base({ base: layer.base ?? "" })}
        </span>
      )}
      {notes.map((note) => (
        <span key={note.text} className={note.className}>
          {note.text}
        </span>
      ))}
    </div>
  ) : null
}
