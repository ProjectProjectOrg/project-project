import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import { finishedStatusSlugs, isEpic } from "@pp/shared"
import type {
  GithubConnection,
  Member,
  TicketDetail,
  TicketId
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Archive } from "lucide-react"
import type { ReactNode } from "react"

import { Markdown } from "@/features/editor/components/Markdown"
import { TicketTimeSection } from "@/features/everhour/components/TicketTimePanel"
import { TicketGitPanel } from "@/features/github/components/ticket-git/TicketGit"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TagEditor } from "@/features/tags/components/TagEditor"
import {
  archiveTicket,
  ticketBodyDraft,
  ticketRequest,
  unarchiveTicket,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { ArchiveTicketControl } from "@/features/tickets/components/ticket-list/ArchiveControl"
import { AssigneePicker } from "@/features/tickets/components/ticket-list/AssigneeField"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityBadgeTrigger } from "@/features/tickets/components/ticket-list/PriorityField"
import { SprintBadgeTrigger } from "@/features/tickets/components/ticket-list/SprintField"
import { StatusSelect } from "@/features/tickets/components/ticket-list/StatusField"
import { TypeBadgeTrigger } from "@/features/tickets/components/ticket-list/TypeField"
import { TicketRelationRows } from "@/features/tickets/components/ticket-marks/TicketRelationRows"
import {
  TicketContextMenu,
  TicketMenuButton
} from "@/features/tickets/components/ticket-menu/TicketMenu"
import { DescriptionField } from "@/features/tickets/components/ticket-page/DescriptionField"
import { EpicField } from "@/features/tickets/components/ticket-page/EpicField"
import { FlagNote } from "@/features/tickets/components/ticket-page/FlagNote"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { SplitResultBanner } from "@/features/tickets/components/ticket-page/SplitResultBanner"
import { SubTicketOf } from "@/features/tickets/components/ticket-page/SubTicketOf"
import { TemplateSwapNote } from "@/features/tickets/components/ticket-page/TemplateSwapNote"
import { TicketBackButton } from "@/features/tickets/components/ticket-page/TicketBackButton"
import { TicketDesignLinks } from "@/features/tickets/components/ticket-page/TicketDesignLinks"
import { TicketDiscussion } from "@/features/tickets/components/ticket-page/TicketDiscussion"
import { TicketPageHeader } from "@/features/tickets/components/ticket-page/TicketPageHeader"
import { TicketPageShell } from "@/features/tickets/components/ticket-page/TicketPageShell"
import { useTemplateSwap } from "@/features/tickets/components/ticket-page/useTemplateSwap"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { openBlockers } from "@/features/tickets/lib/relationGroups"
import { ticketHierarchy } from "@/features/tickets/lib/ticketHierarchy"
import type { TicketPageSource } from "@/features/tickets/lib/ticketSearch"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

const NO_SPLIT_RESULTS: ReadonlyArray<TicketId> = []

export function TicketPage({
  ticket,
  members,
  github,
  autoFocusBody = false,
  splitInto = NO_SPLIT_RESULTS,
  from,
  stepper
}: {
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  github: GithubConnection | null
  autoFocusBody?: boolean
  splitInto?: ReadonlyArray<TicketId>
  from?: TicketPageSource
  stepper: ReactNode
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const updateTicket = useAtomSet(updateTicketDetail(req))
  const patchTicket = useAtomSet(updateTicketDetail(req), {
    mode: "promiseExit"
  })
  const archiveTicketSet = useAtomSet(archiveTicket(req), {
    mode: "promiseExit"
  })
  const archiveState = useAtomValue(archiveTicket(req))
  const unarchiveTicketSet = useAtomSet(unarchiveTicket(req))
  const unarchiveState = useAtomValue(unarchiveTicket(req))
  const bodyDraft = useAtomValue(ticketBodyDraft(req))
  const actor = useProjectActor()
  const estimation = useEstimationMode()
  const canEdit = TicketPolicy.canChange(actor, { content: true })
  const hierarchy = ticketHierarchy(ticket)
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const blocked =
    openBlockers(
      ticket.relations,
      new Set(
        finishedStatusSlugs(Result.isSuccess(statuses) ? statuses.value : [])
      )
    ).length > 0
  const navigate = useNavigate()
  const goToProject = () =>
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug",
      params: { orgSlug, slug }
    })
  const {
    descriptionRef,
    onTypePatch,
    note: swapNote,
    undo: undoSwap
  } = useTemplateSwap(ticket.type, patchTicket)

  return (
    <TicketPageShell
      back={<TicketBackButton from={from} />}
      aside={
        <TicketContextMenu
          ticket={ticket}
          members={members}
          onPatch={updateTicket}
          template={{ ticket, body: bodyDraft ?? ticket.body }}
          onDeleted={goToProject}
        >
          <aside className="flex min-w-0 flex-col gap-5 px-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:[scrollbar-gutter:stable] lg:self-start lg:overflow-y-auto lg:pt-3 lg:pr-1 lg:pl-5">
            <fieldset disabled={!canEdit} className="contents">
              <MetaRow controls label={m.tickets_page_group_properties()}>
                <StatusSelect
                  value={ticket.status}
                  onChange={(status) => updateTicket({ status })}
                  disabled={!canEdit}
                  blocked={blocked}
                  showLabel
                />
                <TypeBadgeTrigger ticket={ticket} onPatch={onTypePatch} />
                <PriorityBadgeTrigger ticket={ticket} onPatch={updateTicket} />
                <AssigneePicker
                  ticket={ticket}
                  members={members}
                  onPatch={updateTicket}
                />
              </MetaRow>
              <MetaRow label={m.tickets_page_group_time()}>
                {estimation !== "off" && (
                  <div className="-ml-2.5 [&_[data-slot=button]]:h-7">
                    <EstimateBadgeTrigger
                      ticket={ticket}
                      mode={estimation}
                      onPatch={updateTicket}
                    />
                  </div>
                )}
                {actor.call("everhour", "ticketTime") && (
                  <TicketTimeSection ticket={ticket} />
                )}
              </MetaRow>
              <MetaRow controls label={m.tickets_page_meta_tags()}>
                <TagEditor
                  ticket={ticket}
                  canManageTags={actor.call("tags", "create")}
                />
              </MetaRow>
              <MetaRow controls label={m.tickets_page_group_planning()}>
                {!isEpic(ticket) && <SprintBadgeTrigger ticketId={ticket.id} />}
                {!isEpic(ticket) && hierarchy.subTicketOf === null && (
                  <EpicField
                    ticket={ticket}
                    editable={canEdit}
                    onPatch={updateTicket}
                  />
                )}
              </MetaRow>
              <TicketRelationRows
                ticketId={ticket.id}
                relations={ticket.relations}
                members={members}
                editable={canEdit}
              />
            </fieldset>
            {github && (
              <MetaRow controls label={m.tickets_page_meta_git()}>
                <TicketGitPanel
                  ticket={ticket}
                  github={github}
                  branchTemplate={null}
                  variant="ghost"
                />
              </MetaRow>
            )}
            <TicketDesignLinks ticket={ticket} />
          </aside>
        </TicketContextMenu>
      }
      actions={
        <>
          {stepper}
          {actor.call("tickets", "archive") && (
            <ArchiveTicketControl
              ticket={ticket}
              archived={ticket.archivedAt !== null}
              onArchive={archiveTicketSet}
              onUnarchive={unarchiveTicketSet}
              waiting={
                ticket.archivedAt !== null
                  ? unarchiveState.waiting
                  : archiveState.waiting
              }
              failed={
                ticket.archivedAt !== null
                  ? Result.isFailure(unarchiveState)
                  : Result.isFailure(archiveState)
              }
            />
          )}
          <TicketMenuButton
            ticket={ticket}
            members={members}
            onPatch={updateTicket}
            template={{ ticket, body: bodyDraft ?? ticket.body }}
            onDeleted={goToProject}
          />
        </>
      }
      header={
        <>
          {ticket.archivedAt !== null && (
            <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-caption text-muted-foreground">
              <Archive className="size-3.5 shrink-0" strokeWidth={1.75} />
              {m.tickets_archived_banner()}
            </p>
          )}
        </>
      }
    >
      {splitInto.length > 0 && <SplitResultBanner created={splitInto} />}

      <main className="flex min-w-0 flex-col gap-6 sm:ml-(--ticket-rail-inset)">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:-ml-(--ticket-rail-inset)">
            <TicketPageHeader
              ticket={ticket}
              readOnly={!canEdit}
              onTitleEnter={() => descriptionRef.current?.focus()}
              meta={<SubTicketOf ticket={ticket} from={from} />}
            />
          </div>
          {ticket.flag !== null && (
            <FlagNote
              flag={ticket.flag}
              members={members}
              onRemove={canEdit ? () => updateTicket({ flag: null }) : null}
            />
          )}
          {swapNote !== null && (
            <TemplateSwapNote name={swapNote.name} onUndo={undoSwap} />
          )}
          {canEdit ? (
            <DescriptionField
              key={ticket.id}
              ref={descriptionRef}
              ticket={ticket}
              members={members}
              autoFocus={autoFocusBody}
              onStartType={(type) => onTypePatch({ type })}
            />
          ) : (
            <Markdown>{ticket.body}</Markdown>
          )}
        </div>

        <TicketDiscussion
          ticket={ticket}
          members={members}
          editable={canEdit}
          holdsChildren={hierarchy.holdsChildren}
        />
      </main>
    </TicketPageShell>
  )
}
