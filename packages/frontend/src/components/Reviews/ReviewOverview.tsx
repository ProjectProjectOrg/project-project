import { Link } from "@tanstack/react-router"
import {
  CalendarClock,
  CircleDot,
  FileCode2,
  GitBranch,
  GitCommitVertical,
  GitPullRequest,
  MessageSquareText,
  Ticket
} from "lucide-react"
import { Markdown } from "@/components/Markdown"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import type {
  ReviewActor,
  ReviewDecision,
  ReviewParticipant,
  ReviewPrState,
  TicketStatus
} from "@projectproject/shared"

import type { ReviewPage as ReviewPageDto } from "@projectproject/shared"

export function ReviewOverview({
  orgSlug,
  slug,
  review
}: {
  orgSlug: string
  slug: string
  prNumber: number
  review: ReviewPageDto
}) {
  const pr = review.pr
  return (
    <div className="@container/review-overview min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-8 @[58rem]/review-overview:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <GitPullRequest
                  className={cn(
                    "mt-1 size-6 shrink-0",
                    pr.state === "open"
                      ? "text-state-success"
                      : pr.state === "merged"
                        ? "text-state-merged"
                        : "text-muted-foreground"
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="min-w-0 text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
                      {pr.title}
                    </h1>
                    {pr.draft && (
                      <Badge tone="muted">{m.reviews_pr_draft()}</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm text-muted-foreground">
                <Badge tone={stateTone(pr.state)} className="shrink-0">
                  {stateLabel(pr.state)}
                </Badge>
                <ActorMerge
                  actor={pr.author}
                  base={pr.base.label}
                  head={pr.head.label}
                />
              </div>
            </div>
          </header>

          <StatsStrip review={review} orgSlug={orgSlug} slug={slug} />

          <section className="min-w-0">
            {pr.body.trim().length > 0 ? (
              <Markdown htmlPolicy="skip" className="max-w-none">
                {pr.body}
              </Markdown>
            ) : (
              <div className="rounded-lg border border-border bg-background px-5 py-4 text-sm text-muted-foreground">
                {m.reviews_overview_empty_body()}
              </div>
            )}
          </section>
        </main>

        <aside className="flex min-w-0 flex-col gap-6 @[58rem]/review-overview:sticky @[58rem]/review-overview:top-6 @[58rem]/review-overview:self-start @[58rem]/review-overview:border-l @[58rem]/review-overview:border-border/60 @[58rem]/review-overview:pl-6">
          <LinkedTicket orgSlug={orgSlug} slug={slug} review={review} />
          <PeopleSection
            title={m.reviews_reviewers_title()}
            empty={m.reviews_reviewers_empty()}
            people={review.reviewers}
            renderMeta={(reviewer) => decisionLabel(reviewer.decision)}
          />
          <PeopleSection
            title={m.reviews_participants_title()}
            empty={m.reviews_participants_empty()}
            people={review.participants}
            renderMeta={(participant) => roleLabel(participant.role)}
          />
          <Details review={review} />
        </aside>
      </div>
    </div>
  )
}

function StatsStrip({
  review,
  orgSlug,
  slug
}: {
  review: ReviewPageDto
  orgSlug: string
  slug: string
}) {
  const counts = review.pr.counts
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <Stat icon={GitCommitVertical}>
          {m.reviews_counts_commits({ count: counts.commits })}
        </Stat>
        <span className="text-muted-foreground/50">·</span>
        <Stat icon={FileCode2}>
          {m.reviews_counts_files({ count: counts.filesChanged })}
        </Stat>
        <span className="font-mono text-state-success tabular-nums">
          +{counts.additions}
        </span>
        <span className="font-mono text-state-danger tabular-nums">
          -{counts.deletions}
        </span>
        <DiffPips additions={counts.additions} deletions={counts.deletions} />
        {counts.reviewComments > 0 && (
          <Stat icon={MessageSquareText}>
            {m.reviews_counts_review_comments({
              count: counts.reviewComments
            })}
          </Stat>
        )}
      </div>
      <Button
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/reviews/$prNumber"
            params={{
              orgSlug,
              slug,
              prNumber: String(review.pr.number)
            }}
            search={{ view: "files" }}
          />
        }
        size="sm"
        variant="primary"
        className="self-start md:self-auto"
      >
        {m.reviews_action_review_changes()}
      </Button>
    </div>
  )
}

export function diffPipTones({
  additions,
  deletions,
  length = 6
}: {
  additions: number
  deletions: number
  length?: number
}) {
  const total = additions + deletions
  if (total === 0) return Array.from({ length }, () => "muted" as const)
  if (additions === 0) return Array.from({ length }, () => "deletion" as const)
  if (deletions === 0) return Array.from({ length }, () => "addition" as const)

  const deletionPips = Math.min(
    length - 1,
    Math.max(1, Math.round((deletions / total) * length))
  )
  const additionPips = length - deletionPips

  return [
    ...Array.from({ length: additionPips }, () => "addition" as const),
    ...Array.from({ length: deletionPips }, () => "deletion" as const)
  ]
}

function DiffPips({
  additions,
  deletions
}: {
  additions: number
  deletions: number
}) {
  const tones = diffPipTones({ additions, deletions })
  const toneClasses = {
    addition: "bg-state-success",
    deletion: "bg-state-danger",
    muted: "bg-muted-foreground/35"
  }
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {tones.map((tone, index) => (
        <span
          key={index}
          className={cn("size-2 rounded-sm", toneClasses[tone])}
        />
      ))}
    </span>
  )
}

function Stat({
  icon: Icon,
  tone,
  children
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  tone?: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn("size-4", tone)} strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  )
}

function LinkedTicket({
  orgSlug,
  slug,
  review
}: {
  orgSlug: string
  slug: string
  review: ReviewPageDto
}) {
  const ticket = review.linkedTicket
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{m.reviews_linked_ticket()}</h2>
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        className="group flex flex-col gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/40"
      >
        <div className="flex items-center gap-2">
          <Ticket
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="font-mono text-xs text-muted-foreground">
            {ticket.id}
          </span>
          <Badge tone="outline" size="xs">
            {ticketStatusLabel(ticket.status)}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          {ticket.title}
        </p>
        {ticket.branch && (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {ticket.branch}
          </span>
        )}
      </Link>
    </section>
  )
}

function PeopleSection<T extends { actor: ReviewActor }>({
  title,
  empty,
  people,
  renderMeta
}: {
  title: string
  empty: string
  people: ReadonlyArray<T>
  renderMeta: (item: T) => string
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {people.map((item) => (
            <PersonRow
              key={`${item.actor.login}-${renderMeta(item)}`}
              actor={item.actor}
              meta={renderMeta(item)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PersonRow({ actor, meta }: { actor: ReviewActor; meta: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ActorAvatar actor={actor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {actor.name ?? actor.login}
        </p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  )
}

function Details({ review }: { review: ReviewPageDto }) {
  const pr = review.pr
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{m.reviews_details_repo()}</h2>
      <div className="flex flex-col gap-2 text-sm">
        <DetailRow icon={GitBranch} label={m.reviews_details_repo()}>
          <span className="font-mono text-xs">
            {pr.repoOwner}/{pr.repoName}
          </span>
        </DetailRow>
        <DetailRow icon={CircleDot} label={m.reviews_check_label()}>
          <span>{checkStatusLabel(pr.checks.status)}</span>
        </DetailRow>
        <DateRow label={m.reviews_details_created()} date={pr.createdAt} />
        <DateRow label={m.reviews_details_updated()} date={pr.updatedAt} />
        {pr.mergedAt && (
          <DateRow label={m.reviews_details_merged()} date={pr.mergedAt} />
        )}
      </div>
    </section>
  )
}

function DateRow({ label, date }: { label: string; date: Date }) {
  const locale = getLocale()
  return (
    <DetailRow icon={CalendarClock} label={label}>
      <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>
        {date.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric"
        })}
      </time>
    </DetailRow>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

function ActorMerge({
  actor,
  base,
  head
}: {
  actor: ReviewActor
  base: string
  head: string
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      <ActorAvatar actor={actor} size="xs" />
      <span className="shrink-0 font-medium text-foreground">
        {actor.login}
      </span>
      <span className="shrink-0">{m.reviews_branch_merge_into()}</span>
      <BranchChip value={base} fixed />
      <span className="shrink-0">{m.reviews_branch_merge_from()}</span>
      <BranchChip value={head} />
    </span>
  )
}

function ActorAvatar({
  actor,
  size = "sm"
}: {
  actor: ReviewActor
  size?: "xs" | "sm"
}) {
  return (
    <Avatar
      size={size === "xs" ? "default" : "sm"}
      className={cn(size === "xs" && "size-5")}
    >
      {actor.avatarUrl && <AvatarImage src={actor.avatarUrl} alt="" />}
      <AvatarFallback>{actor.login.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

function BranchChip({
  value,
  fixed = false
}: {
  value: string
  fixed?: boolean
}) {
  const label = value.includes(":")
    ? value.split(":").slice(1).join(":")
    : value
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground",
        fixed ? "shrink-0" : "min-w-0 max-w-[16rem]"
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

function stateTone(state: ReviewPrState): BadgeTone {
  if (state === "open") return "emerald"
  if (state === "merged") return "violet"
  return "muted"
}

function stateLabel(state: ReviewPrState): string {
  if (state === "open") return m.reviews_pr_open()
  if (state === "merged") return m.reviews_pr_merged()
  return m.reviews_pr_closed()
}

function ticketStatusLabel(status: TicketStatus): string {
  if (status === "todo") return m.tickets_status_todo()
  if (status === "in_progress") return m.tickets_status_in_progress()
  return m.tickets_status_done()
}

function checkStatusLabel(status: ReviewPageDto["pr"]["checks"]["status"]) {
  if (status === "passing") return m.reviews_check_status_passing()
  if (status === "failing") return m.reviews_check_status_failing()
  if (status === "pending") return m.reviews_check_status_pending()
  if (status === "neutral") return m.reviews_check_status_neutral()
  return m.reviews_check_status_none()
}

function decisionLabel(decision: ReviewDecision): string {
  if (decision === "approved") return m.reviews_decision_approved()
  if (decision === "changes_requested") {
    return m.reviews_decision_changes_requested()
  }
  if (decision === "commented") return m.reviews_decision_commented()
  if (decision === "pending") return m.reviews_decision_pending()
  if (decision === "dismissed") return m.reviews_decision_dismissed()
  return m.reviews_decision_none()
}

function roleLabel(role: ReviewParticipant["role"]): string {
  if (role === "author") return m.reviews_role_author()
  if (role === "reviewer") return m.reviews_role_reviewer()
  if (role === "commenter") return m.reviews_role_commenter()
  return m.reviews_role_committer()
}
