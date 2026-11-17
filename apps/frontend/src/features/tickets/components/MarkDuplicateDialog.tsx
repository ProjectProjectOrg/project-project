import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, ProjectStatus, TicketDetail } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowDown, Eye, UserRound } from "lucide-react"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { statusesFor } from "@/features/projects/atoms/projectStatuses"
import {
  ProjectContext,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  markDuplicateDialog,
  type MarkDuplicateDialogRequest
} from "@/features/tickets/atoms/markDuplicateDialog"
import {
  archiveTicket,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { statusLabelFor } from "@/features/tickets/lib/ticketMeta"
import { useRouteBoundDialog } from "@/hooks/useRouteBoundDialog"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function MarkDuplicateDialogHost() {
  const { open, shown, close, finalFocus } =
    useRouteBoundDialog(markDuplicateDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        size="lg"
        position="center"
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {shown !== null && (
          <ProjectContext value={projectRequest(shown.orgSlug, shown.slug)}>
            <DuplicateReview
              key={`${shown.orgSlug}:${shown.slug}:${shown.ticketId}:${shown.originalId}`}
              request={shown}
              onDone={close}
            />
          </ProjectContext>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DuplicateReview({
  request,
  onDone
}: Readonly<{
  request: MarkDuplicateDialogRequest
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
      <DialogHeader className="pr-8">
        <DialogTitle>
          {swapped
            ? m.tickets_duplicate_title_from({ id: request.originalId })
            : m.tickets_duplicate_title_to({ id: request.originalId })}
        </DialogTitle>
      </DialogHeader>
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
  request: MarkDuplicateDialogRequest
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
            variant="quiet"
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
      <ConfirmButton.Root bare>
        <ConfirmButton.Action
          layout="stacked"
          tone="neutral"
          prompt={null}
          label={m.tickets_duplicate_submit()}
          waiting={state.waiting}
          error={error}
          disabled={blocked !== null}
          onCancel={onDone}
          onConfirm={async () => {
            const exit = await archive({ duplicateOf: original.id })
            if (Exit.isSuccess(exit)) {
              onDone()
              void navigate({
                to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
                params: { orgSlug, slug, id: original.id }
              })
            }
            return exit
          }}
        />
      </ConfirmButton.Root>
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
