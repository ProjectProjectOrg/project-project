import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Ticket } from "lucide-react"
import { TicketMentionCard } from "@/components/Lexical/TicketMentionCard"
import { ActorAvatar } from "@/components/Reviews/ReviewActors"
import {
  checkSummaryLabel,
  ticketStatusLabel
} from "@/components/Reviews/ReviewLabels"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import type { ReviewActor, ReviewPage } from "@projectproject/shared"

export function ReviewLinkedTicket({
  orgSlug,
  slug,
  review,
  label
}: {
  orgSlug: string
  slug: string
  review: ReviewPage
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
          className="group flex flex-col gap-1.5 rounded-lg bg-accent px-4 py-3 text-left transition-colors hover:bg-accent/80"
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

export function ReviewPeopleSection<T extends { actor: ReviewActor }>({
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

export function ReviewDetailsRows({ review }: { review: ReviewPage }) {
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
