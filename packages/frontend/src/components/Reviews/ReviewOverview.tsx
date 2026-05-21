import { Link } from "@tanstack/react-router"
import {
  ArrowUpRight,
  Check,
  Copy,
  FileCode2,
  GitCommitVertical,
  MessageSquareText,
  MoreHorizontal,
  Ticket
} from "lucide-react"
import { useState } from "react"
import { Markdown } from "@/components/Markdown"
import { TicketMentionCard } from "@/components/Lexical/TicketMentionCard"
import { ReviewActions } from "@/components/Reviews/ReviewActions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import type {
  ReviewActor,
  ReviewDecision,
  ReviewParticipant,
  TicketStatus
} from "@projectproject/shared"

import type { ReviewPage as ReviewPageDto } from "@projectproject/shared"

export function ReviewOverview({
  orgSlug,
  slug,
  prNumber,
  review
}: {
  orgSlug: string
  slug: string
  prNumber: number
  review: ReviewPageDto
}) {
  const pr = review.pr
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="flex min-w-0 flex-col gap-6">
          <StatsStrip review={review} orgSlug={orgSlug} slug={slug} />

          <section className="min-w-0">
            {pr.body.trim().length > 0 ? (
              <div className="flex min-w-0 items-start gap-2">
                <Markdown
                  htmlPolicy="skip"
                  className="min-w-0 max-w-none flex-1"
                >
                  {pr.body}
                </Markdown>
                <BodyActionsMenu body={pr.body} />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background px-5 py-4 text-sm text-muted-foreground">
                {m.reviews_overview_empty_body()}
              </div>
            )}
          </section>

          <ReviewActions
            orgSlug={orgSlug}
            slug={slug}
            prNumber={prNumber}
            review={review}
          />
        </main>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-border/60 lg:pl-6">
          <LinkedTicket
            orgSlug={orgSlug}
            slug={slug}
            review={review}
            label={m.reviews_linked_ticket()}
          />
          <PeopleSection
            label={m.reviews_reviewers_title()}
            empty={m.reviews_reviewers_empty()}
            people={review.reviewers}
            renderMeta={(reviewer) => decisionLabel(reviewer.decision)}
          />
          <PeopleSection
            label={m.reviews_participants_title()}
            empty={m.reviews_participants_empty()}
            people={review.participants}
            renderMeta={(participant) => roleLabel(participant.role)}
          />
          <DetailsRows review={review} />
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
    <div className="@container flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/70 px-4 py-3 @max-xs:flex-col @max-xs:items-start">
      <div className="flex items-center gap-x-3 gap-y-2 whitespace-nowrap text-sm text-muted-foreground @max-xs:flex-col @max-xs:items-start">
        <Stat icon={GitCommitVertical}>
          {m.reviews_counts_commits({ count: counts.commits })}
        </Stat>
        <span className="text-muted-foreground/50 @max-xs:hidden">·</span>
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
      >
        {m.reviews_action_review_changes()}
      </Button>
    </div>
  )
}

function BodyActionsMenu({ body }: { body: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
        setOpen(false)
      }, 1000)
    } catch {}
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setCopied(false)
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.reviews_body_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-all duration-100 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-48">
        <DropdownMenuItem
          closeOnClick={false}
          onClick={handleCopy}
          className="cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="size-4 text-state-success" strokeWidth={2} />
              {m.reviews_action_copy_markdown_done()}
            </>
          ) : (
            <>
              <Copy className="size-4" strokeWidth={1.75} />
              {m.reviews_action_copy_markdown()}
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  review,
  label
}: {
  orgSlug: string
  slug: string
  review: ReviewPageDto
  label: string
}) {
  const ticket = review.linkedTicket
  return (
    <MetaRow label={label}>
      <Popover>
        <PopoverTrigger
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: ticket.id }}
            />
          }
          openOnHover
          className="group flex flex-col gap-1.5 rounded-lg bg-muted/70 px-4 py-3 text-left transition-colors hover:bg-muted"
        >
          <div className="flex min-w-0 items-center gap-2">
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
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <MentionScopeProvider scope={{ orgSlug, slug }}>
            <TicketMentionCard ticketId={ticket.id} />
          </MentionScopeProvider>
        </PopoverContent>
      </Popover>
    </MetaRow>
  )
}

function PeopleSection<T extends { actor: ReviewActor }>({
  label,
  empty,
  people,
  renderMeta
}: {
  label: string
  empty: string
  people: ReadonlyArray<T>
  renderMeta: (item: T) => string
}) {
  return (
    <MetaRow label={label}>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {people.map((item) => (
            <PersonRow
              key={`${item.actor.login}-${renderMeta(item)}`}
              actor={item.actor}
              meta={renderMeta(item)}
            />
          ))}
        </div>
      )}
    </MetaRow>
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

function DetailsRows({ review }: { review: ReviewPageDto }) {
  const pr = review.pr
  return (
    <>
      <MetaRow label={m.reviews_details_repo()}>
        <Badge
          tone="outline"
          size="sm"
          render={
            <a
              href={`https://github.com/${pr.repoOwner}/${pr.repoName}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          {pr.repoOwner}/{pr.repoName}
          <ArrowUpRight className="size-3 shrink-0" strokeWidth={1.75} />
        </Badge>
      </MetaRow>
      <MetaRow label={m.reviews_check_label()}>
        <span className="text-xs">{checkSummaryLabel(pr.checks)}</span>
      </MetaRow>
      <DateRow label={m.reviews_details_created()} date={pr.createdAt} />
      <DateRow label={m.reviews_details_updated()} date={pr.updatedAt} />
      {pr.mergedAt && (
        <DateRow label={m.reviews_details_merged()} date={pr.mergedAt} />
      )}
    </>
  )
}

function DateRow({ label, date }: { label: string; date: Date }) {
  const locale = getLocale()
  return (
    <MetaRow label={label}>
      <time
        dateTime={date.toISOString()}
        title={date.toLocaleString(locale)}
        className="text-xs"
      >
        {date.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric"
        })}
      </time>
    </MetaRow>
  )
}

function MetaRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ActorAvatar({
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

function ticketStatusLabel(status: TicketStatus): string {
  if (status === "todo") return m.tickets_status_todo()
  if (status === "in_progress") return m.tickets_status_in_progress()
  return m.tickets_status_done()
}

export function checkSummaryLabel(checks: ReviewPageDto["pr"]["checks"]) {
  if (checks.status === "none" || checks.totalCount === 0) {
    return m.reviews_check_status_none()
  }
  if (checks.status === "passing") {
    return m.reviews_check_summary_passing({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  if (checks.status === "failing") {
    return m.reviews_check_summary_failing({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  if (checks.status === "pending") {
    return m.reviews_check_summary_pending({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  if (checks.status === "neutral") {
    return m.reviews_check_summary_neutral({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
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
