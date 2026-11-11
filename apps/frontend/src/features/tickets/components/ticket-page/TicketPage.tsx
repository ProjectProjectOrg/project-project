import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type {
  GithubConnection,
  Member,
  TicketDetail,
  TicketId,
  TicketViewSource
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Archive } from "lucide-react"
import { useState } from "react"

import { type SaveStatus } from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import { MarkdownSaveIndicator } from "@/features/editor/components/MarkdownSaveIndicator"
import { TicketTimeSection } from "@/features/everhour/components/TicketTimePanel"
import { TicketGitPanel } from "@/features/github/components/ticket-git/TicketGit"
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
import { TypeBadgeTrigger } from "@/features/tickets/components/ticket-list/TypeField"
import { BlockedByNote } from "@/features/tickets/components/ticket-marks/BlockedByNote"
import { TicketRelationRows } from "@/features/tickets/components/ticket-marks/TicketRelationRows"
import {
  TicketContextMenu,
  TicketMenuButton
} from "@/features/tickets/components/ticket-menu/TicketMenu"
import { DescriptionField } from "@/features/tickets/components/ticket-page/DescriptionField"
import { EpicField } from "@/features/tickets/components/ticket-page/EpicField"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { ParentTicketLink } from "@/features/tickets/components/ticket-page/ParentTicketLink"
import { SplitResultBanner } from "@/features/tickets/components/ticket-page/SplitResultBanner"
import { TemplateSwapNote } from "@/features/tickets/components/ticket-page/TemplateSwapNote"
import { TicketDesignLinks } from "@/features/tickets/components/ticket-page/TicketDesignLinks"
import { TicketDiscussion } from "@/features/tickets/components/ticket-page/TicketDiscussion"
import { TicketPageHeader } from "@/features/tickets/components/ticket-page/TicketPageHeader"
import { TicketPageShell } from "@/features/tickets/components/ticket-page/TicketPageShell"
import { TicketStepper } from "@/features/tickets/components/ticket-page/TicketStepper"
import { useTemplateSwap } from "@/features/tickets/components/ticket-page/useTemplateSwap"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import {
  type TicketHierarchy,
  ticketHierarchy
} from "@/features/tickets/lib/ticketHierarchy"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

const NO_SPLIT_RESULTS: ReadonlyArray<TicketId> = []

export function TicketPage({
  ticket,
  members,
  github,
  autoFocusBody = false,
  splitInto = NO_SPLIT_RESULTS,
  from
}: {
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  github: GithubConnection | null
  autoFocusBody?: boolean
  splitInto?: ReadonlyArray<TicketId>
  from?: TicketViewSource
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
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const bodyDraft = useAtomValue(ticketBodyDraft(req))
  const actor = useProjectActor()
  const estimation = useEstimationMode()
  const canEdit = TicketPolicy.canChange(actor, { content: true })
  const hierarchy = ticketHierarchy(ticket)
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
      back={{
        to: "/orgs/$orgSlug/projects/$slug",
        params: { orgSlug, slug }
      }}
      actions={
        <>
          <MarkdownSaveIndicator status={bodyStatus} />
          {from && <TicketStepper ticketId={ticket.id} from={from} />}
          {actor.call("tickets", "archive") && (
            <ArchiveTicketControl
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
        <TicketPageHeader
          ticket={ticket}
          readOnly={!canEdit}
          onPatch={updateTicket}
          meta={
            <>
              <fieldset disabled={!canEdit} className="contents">
                <TypeBadgeTrigger
                  ticket={ticket}
                  onPatch={onTypePatch}
                  className="-mx-2 px-2"
                />
              </fieldset>
              {hierarchy.subTicketOf !== null && (
                <ParentTicketLink
                  parent={hierarchy.subTicketOf}
                  variant="inline"
                  label={m.tickets_header_sub_ticket_of()}
                />
              )}
              <BlockedByNote relations={ticket.relations} />
              {swapNote !== null && (
                <TemplateSwapNote name={swapNote.name} onUndo={undoSwap} />
              )}
              {ticket.archivedAt !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro text-muted-foreground">
                  <Archive className="size-3" strokeWidth={1.75} />
                  {m.tickets_archived_badge()}
                </span>
              )}
            </>
          }
        />
      }
    >
      {splitInto.length > 0 && <SplitResultBanner created={splitInto} />}

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="flex min-w-0 flex-col gap-6 sm:pl-(--ticket-rail-inset)">
          {canEdit ? (
            <DescriptionField
              ref={descriptionRef}
              ticket={ticket}
              members={members}
              autoFocus={autoFocusBody}
              onStatusChange={setBodyStatus}
            />
          ) : (
            <Markdown>{ticket.body}</Markdown>
          )}

          <TicketDiscussion
            ticket={ticket}
            members={members}
            editable={canEdit}
            holdsChildren={hierarchy.holdsChildren}
          />
        </main>

        <TicketContextMenu
          ticket={ticket}
          members={members}
          onPatch={updateTicket}
          template={{ ticket, body: bodyDraft ?? ticket.body }}
          onDeleted={goToProject}
        >
          <aside className="flex min-w-0 flex-col gap-4 sm:pl-(--ticket-rail-inset) lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:[scrollbar-gutter:stable] lg:self-start lg:overflow-y-auto lg:pr-1 lg:pl-5">
            <fieldset disabled={!canEdit} className="contents">
              <MetaRow controls label={m.tickets_page_meta_priority()}>
                <PriorityBadgeTrigger ticket={ticket} onPatch={updateTicket} />
              </MetaRow>
              {estimation !== "off" && (
                <MetaRow controls label={m.tickets_page_meta_estimate()}>
                  <EstimateBadgeTrigger
                    ticket={ticket}
                    mode={estimation}
                    onPatch={updateTicket}
                  />
                </MetaRow>
              )}
              <PlanningMetaRows
                ticket={ticket}
                hierarchy={hierarchy}
                editable={canEdit}
                onPatch={updateTicket}
              />
              <TicketRelationRows
                ticketId={ticket.id}
                relations={ticket.relations}
                members={members}
                editable={canEdit}
              />
              <MetaRow controls label={m.tickets_page_meta_assignees()}>
                <AssigneePicker
                  ticket={ticket}
                  members={members}
                  onPatch={updateTicket}
                />
              </MetaRow>
              <MetaRow controls label={m.tickets_page_meta_tags()}>
                <TagEditor
                  ticket={ticket}
                  canManageTags={actor.call("tags", "create")}
                />
              </MetaRow>
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
            {actor.call("everhour", "ticketTime") && (
              <TicketTimeSection ticket={ticket} />
            )}
          </aside>
        </TicketContextMenu>
      </div>
    </TicketPageShell>
  )
}

function PlanningMetaRows({
  ticket,
  hierarchy,
  editable,
  onPatch
}: Readonly<{
  ticket: TicketDetail
  hierarchy: TicketHierarchy
  editable: boolean
  onPatch: (patch: TicketEdit) => void
}>) {
  if (ticket.type === "epic") return null
  return (
    <>
      <MetaRow controls label={m.tickets_page_meta_sprint()}>
        <SprintBadgeTrigger ticketId={ticket.id} />
      </MetaRow>
      {hierarchy.subTicketOf !== null ? (
        <MetaRow controls label={m.tickets_page_meta_sub_ticket_of()}>
          <ParentTicketLink parent={hierarchy.subTicketOf} />
        </MetaRow>
      ) : (
        <MetaRow controls label={m.tickets_page_meta_epic()}>
          <EpicField ticket={ticket} editable={editable} onPatch={onPatch} />
        </MetaRow>
      )}
    </>
  )
}
