import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, ProjectStatus, TicketDetail } from "@pp/shared"
import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { ArrowDown, Eye, UserRound } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { statusesFor } from "@/features/projects/atoms/projectStatuses"
import {
  ProjectContext,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  markDuplicateRequest,
  type MarkDuplicateRequest
} from "@/features/tickets/atoms/markDuplicateRequest"
import {
  archiveTicket,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { statusLabelFor } from "@/features/tickets/lib/ticketMeta"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

// cmd+k's "Mark as duplicate" confirmation: both tickets side by side, a swap
// for which one is the duplicate, and the archive that marks it.
export function MarkDuplicatePage({ env }: CommandPageProps) {
  const request = useAtomValue(markDuplicateRequest)
  if (request === null) return null
  const done = () => {
    env.registry.set(markDuplicateRequest, null)
    env.close()
  }
  return (
    <ProjectContext value={projectRequest(request.orgSlug, request.slug)}>
      <div className="flex max-h-[min(440px,76dvh)] flex-col gap-3 overflow-y-auto px-4 pt-3.5 pb-3">
        <DuplicateReview
          key={`${request.orgSlug}:${request.slug}:${request.ticketId}:${request.originalId}`}
          request={request}
          onDone={done}
        />
      </div>
    </ProjectContext>
  )
}

function DuplicateReview({
  request,
  onDone
}: Readonly<{
  request: MarkDuplicateRequest
  onDone: () => void
}>) {
  const { orgSlug, slug, projectReq, statusesReq } = useProjectRoute()
  const [swapped, setSwapped] = useState(false)
  const currentAtom = ticketDetail(
    ticketRequest(orgSlug, slug, request.ticketId)
  )
  const targetAtom = ticketDetail(
    ticketRequest(orgSlug, slug, request.originalId)
  )
  const current = useAtomValue(currentAtom)
  const target = useAtomValue(targetAtom)
  const projectResult = useAtomValue(project(projectReq))
  const statuses = useAtomValue(statusesFor(statusesReq))
  const refreshCurrent = useAtomRefresh(currentAtom)
  const refreshTarget = useAtomRefresh(targetAtom)
  const refreshProject = useAtomRefresh(project(projectReq))
  const refreshStatuses = useAtomRefresh(statusesFor(statusesReq))
  const retry = () => {
    refreshCurrent()
    refreshTarget()
    refreshProject()
    refreshStatuses()
  }
  return (
    <>
      <h2 className="text-body font-semibold">
        {swapped
          ? m.tickets_duplicate_title_from({ id: request.originalId })
          : m.tickets_duplicate_title_to({ id: request.originalId })}
      </h2>
      <AsyncView
        result={Result.all({
          current,
          target,
          project: projectResult,
          statuses
        })}
        onInitial={() => (
          <p className="py-8 text-body text-muted-foreground">
            {m.tickets_duplicate_loading()}
          </p>
        )}
        onFailure={(failure) => (
          <ReadFailure failure={failure} onRetry={retry} />
        )}
        onSuccess={({ value }) => (
          <DuplicateConfirmation
            request={request}
            swapped={swapped}
            onSwap={() => setSwapped((value) => !value)}
            current={value.current}
            target={value.target}
            members={value.project.members}
            statuses={value.statuses}
            onDone={onDone}
          />
        )}
      />
    </>
  )
}

function DuplicateConfirmation({
  request,
  swapped,
  onSwap,
  current,
  target,
  members,
  statuses,
  onDone
}: Readonly<{
  request: MarkDuplicateRequest
  swapped: boolean
  onSwap: () => void
  current: TicketDetail
  target: TicketDetail
  members: ReadonlyArray<Member>
  statuses: ReadonlyArray<ProjectStatus>
  onDone: () => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const duplicate = swapped ? target : current
  const original = swapped ? current : target
  const mutation = archiveTicket(ticketRequest(orgSlug, slug, duplicate.id))
  const archive = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  const navigate = useNavigate()
  const blocked =
    duplicate.archivedAt !== null
      ? m.tickets_duplicate_archived()
      : duplicate.relations.duplicates.length > 0
        ? m.tickets_error_has_duplicates({
            ids: duplicate.relations.duplicates
              .map((ticket) => ticket.id)
              .join(", ")
          })
        : original.relations.duplicateOf !== null
          ? m.tickets_error_duplicate_of_duplicate({
              ticket: original.id,
              original: original.relations.duplicateOf.id
            })
          : null
  const error = mutationErrorText(state) ?? (state.waiting ? null : blocked)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <TicketSummary
          ticket={duplicate}
          members={members}
          statuses={statuses}
          label={m.tickets_duplicate_duplicate()}
          current={duplicate.id === request.ticketId}
          waiting={state.waiting}
        />
        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-border" />
          <Button
            variant="ghost"
            size="compact"
            aria-label={m.tickets_duplicate_swap()}
            title={m.tickets_duplicate_swap()}
            disabled={state.waiting}
            onClick={onSwap}
          >
            <ArrowDown className="size-3.5" />
            {m.tickets_mark_duplicate_of()}
          </Button>
          <div className="h-px flex-1 bg-border" />
        </div>
        <TicketSummary
          ticket={original}
          members={members}
          statuses={statuses}
          label={m.tickets_duplicate_original()}
          current={original.id === request.ticketId}
          waiting={false}
        />
      </div>
      {/* The page is the confirmation: Cancel, or mark it. */}
      {error !== null && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {m.common_cancel_button()}
        </Button>
        <Button
          type="button"
          size="sm"
          loading={state.waiting}
          disabled={blocked !== null || state.waiting}
          onClick={async () => {
            const exit = await archive({ duplicateOf: original.id })
            if (Exit.isSuccess(exit)) {
              onDone()
              void navigate({
                to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
                params: { orgSlug, slug, id: original.id }
              })
            }
          }}
        >
          {m.tickets_duplicate_submit()}
        </Button>
      </div>
    </div>
  )
}

function TicketSummary({
  ticket,
  members,
  statuses,
  label,
  current,
  waiting
}: Readonly<{
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  statuses: ReadonlyArray<ProjectStatus>
  label: string
  current: boolean
  waiting: boolean
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const assignees = ticket.assignees.flatMap((id) => {
    const member = members.find((candidate) => candidate.id === id)
    return member ? [member] : []
  })
  return (
    <section
      className={cn("flex flex-col gap-2 py-4", waiting && "animate-pulse")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <h3>{label}</h3>
        {current && (
          <Badge size="xs">
            <Eye />
            {m.tickets_duplicate_current()}
          </Badge>
        )}
      </div>
      <div className="flex items-baseline gap-2 text-body">
        <span className="shrink-0 font-mono text-caption text-muted-foreground">
          {ticket.id}
        </span>
        <span className="min-w-0 font-semibold wrap-anywhere">
          {ticket.title}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <TicketStatusIcon
            status={ticket.status}
            orgSlug={orgSlug}
            slug={slug}
          />
          {statusLabelFor(ticket.status, statuses)}
        </span>
        {assignees.length === 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-3.5" />
            {m.tickets_assignee_unassigned()}
          </span>
        ) : (
          assignees.map((member) => (
            <span key={member.id} className="inline-flex items-center gap-1.5">
              <MemberAvatar member={member} size={16} />
              {member.name ?? member.email}
            </span>
          ))
        )}
      </div>
    </section>
  )
}
