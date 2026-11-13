import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Member, ProjectStatus, TicketDetail, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowUpRight, ChevronLeft } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { Command } from "@/features/command-menu/lib/commands"
import { CommentsSection } from "@/features/comments/components/CommentsSection"
import { Markdown } from "@/features/editor/components/Markdown"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { ReadSinceContext } from "@/features/tickets/components/ReadSince"
import { TicketPageSkeleton } from "@/features/tickets/components/ticket-page"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

type InboxTicketPaneProps = Readonly<{
  orgSlug: string
  projectSlug: string
  id: TicketId
  readSince: Date | null
  commands: ReadonlyArray<Command>
  onClose: () => void
}>

export function InboxTicketPane({
  orgSlug,
  projectSlug,
  id,
  readSince,
  commands,
  onClose
}: InboxTicketPaneProps) {
  const projectReq = projectRequest(orgSlug, projectSlug)
  const projectResult = useAtomValue(project(projectReq))
  const refresh = useAtomRefresh(project(projectReq))
  const scope = useMemo(
    () => ({ ticket: { orgSlug, slug: projectSlug, ticketId: id }, commands }),
    [orgSlug, projectSlug, id, commands]
  )
  useCommandScope(scope)
  return (
    <ProjectContext value={projectReq}>
      <ReadSinceContext value={readSince}>
        <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-6">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="chip-muted"
              onClick={onClose}
              className="-ml-2 md:invisible"
            >
              <ChevronLeft />
              {m.inbox_back()}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                  params={{ orgSlug, slug: projectSlug, id }}
                />
              }
              className="transition-transform duration-100 active:scale-[0.97]"
            >
              {m.inbox_open_ticket()}
              <ArrowUpRight />
              <Kbd className="max-md:hidden">O</Kbd>
            </Button>
          </div>
          <AsyncView
            result={projectResult}
            reset={refresh}
            contained
            onInitial={() => <TicketPageSkeleton />}
            onSuccess={({ value }) => (
              <LoadedTicket
                orgSlug={orgSlug}
                projectSlug={projectSlug}
                id={id}
                members={value.members}
              />
            )}
          />
        </div>
      </ReadSinceContext>
    </ProjectContext>
  )
}

function LoadedTicket({
  orgSlug,
  projectSlug,
  id,
  members
}: Readonly<{
  orgSlug: string
  projectSlug: string
  id: TicketId
  members: ReadonlyArray<Member>
}>) {
  const result = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, projectSlug, id))
  )
  return Result.matchWithError(result, {
    onInitial: () => <TicketPageSkeleton />,
    onError: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", () => (
          <NotFoundPage
            contained
            title={m.tickets_not_found_title()}
            body={m.tickets_not_found_body()}
          />
        )),
        Match.orElse((error) => <ErrorPage contained error={error} />)
      ),
    onDefect: (defect) => <ErrorPage contained error={defect} />,
    onSuccess: ({ value }) => (
      <ReadOnlyTicket
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        ticket={value}
        members={members}
      />
    )
  })
}

function ReadOnlyTicket({
  orgSlug,
  projectSlug,
  ticket,
  members
}: Readonly<{
  orgSlug: string
  projectSlug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
}>) {
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, projectSlug))
  )
  const statuses = Result.isSuccess(statusesResult)
    ? statusesResult.value
    : NO_STATUSES
  const status = statusMetaFor(ticket.status, statuses)
  const StatusIcon = status.icon
  const assignees = members.filter((member) =>
    ticket.assignees.includes(member.id)
  )
  const body = ticket.body.trim()
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-caption text-muted-foreground">
          {projectSlug} {ticket.id}
        </span>
        <h2 className="text-title font-semibold text-balance">
          {ticket.title}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-body text-muted-foreground">
          <Meta>
            <StatusIcon
              aria-hidden
              className={cn("size-3.5", status.className)}
              style={status.color ? { color: status.color } : undefined}
            />
            {statusLabelFor(ticket.status, statuses)}
          </Meta>
          {assignees.map((member) => (
            <Meta key={member.id}>
              <MemberAvatar member={member} size={16} />
              {member.name}
            </Meta>
          ))}
        </div>
      </header>
      {body === "" ? (
        <p className="text-body text-muted-foreground">
          {m.tickets_peek_no_description()}
        </p>
      ) : (
        <Markdown>{body}</Markdown>
      )}
      <CommentsSection ticketId={ticket.id} />
    </article>
  )
}

function Meta({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">{children}</span>
  )
}
