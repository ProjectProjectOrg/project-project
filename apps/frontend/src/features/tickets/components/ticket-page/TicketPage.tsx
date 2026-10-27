import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type {
  GithubConnection,
  Member,
  TicketDetail,
  TicketId,
  UpdateTicketInput
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { Archive } from "lucide-react"
import { useState } from "react"

import { ConfirmButton } from "@/components/ui/confirm-button"
import { type SaveStatus } from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import { MarkdownSaveIndicator } from "@/features/editor/components/MarkdownSaveIndicator"
import { TicketTimeSection } from "@/features/everhour/components/TicketTimePanel"
import { TicketGitPanel } from "@/features/github/components/ticket-git/TicketGit"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TagEditor } from "@/features/tags/components/TagEditor"
import {
  archiveTicket,
  deleteTicket,
  ticketBodyDraft,
  ticketRequest,
  unarchiveTicket,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { ArchiveTicketControl } from "@/features/tickets/components/ticket-list/ArchiveControl"
import { AssigneePicker } from "@/features/tickets/components/ticket-list/AssigneeField"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityBadgeTrigger } from "@/features/tickets/components/ticket-list/PriorityField"
import { SplitTicketControl } from "@/features/tickets/components/ticket-list/SplitControl"
import { SprintBadgeTrigger } from "@/features/tickets/components/ticket-list/SprintField"
import { TypeBadgeTrigger } from "@/features/tickets/components/ticket-list/TypeField"
import { DescriptionField } from "@/features/tickets/components/ticket-page/DescriptionField"
import { EpicField } from "@/features/tickets/components/ticket-page/EpicField"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { SaveAsTemplatePopover } from "@/features/tickets/components/ticket-page/SaveAsTemplatePopover"
import { SplitResultBanner } from "@/features/tickets/components/ticket-page/SplitResultBanner"
import { TemplateSwapNote } from "@/features/tickets/components/ticket-page/TemplateSwapNote"
import { TicketDesignLinks } from "@/features/tickets/components/ticket-page/TicketDesignLinks"
import { TicketDiscussion } from "@/features/tickets/components/ticket-page/TicketDiscussion"
import { TicketPageHeader } from "@/features/tickets/components/ticket-page/TicketPageHeader"
import { TicketPageShell } from "@/features/tickets/components/ticket-page/TicketPageShell"
import { UserTimestamp } from "@/features/tickets/components/ticket-page/UserTimestamp"
import { useTemplateSwap } from "@/features/tickets/components/ticket-page/useTemplateSwap"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const NO_SPLIT_RESULTS: ReadonlyArray<TicketId> = []

export function TicketPage({
  ticket,
  members,
  github,
  autoFocusBody = false,
  splitInto = NO_SPLIT_RESULTS
}: {
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  github: GithubConnection | null
  autoFocusBody?: boolean
  splitInto?: ReadonlyArray<TicketId>
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const remove = useAtomSet(deleteTicket(req), { mode: "promiseExit" })
  const deleteState = useAtomValue(deleteTicket(req))
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
  const navigate = useNavigate()
  const actor = useProjectActor()
  const estimation = useEstimationMode()
  const canEdit = TicketPolicy.canChange(actor, { content: true })
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
          <SaveAsTemplatePopover
            ticket={ticket}
            body={bodyDraft ?? ticket.body}
          />
          {canEdit && actor.call("tickets", "split") && (
            <SplitTicketControl id={ticket.id} />
          )}
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
          {actor.call("tickets", "delete") && (
            <ConfirmButton.Root>
              <ConfirmButton.DeleteTrigger
                aria-label={m.tickets_detail_delete_aria_label()}
              />
              <ConfirmButton.Confirm>
                <ConfirmButton.Action
                  prompt={m.tickets_detail_delete_confirm()}
                  label={m.common_delete_confirm_button()}
                  busyLabel={m.common_deleting_button()}
                  waiting={deleteState.waiting}
                  onConfirm={async () => {
                    const exit = await remove()
                    if (Exit.isSuccess(exit))
                      void navigate({
                        to: "/orgs/$orgSlug/projects/$slug",
                        params: { orgSlug, slug }
                      })
                    return exit
                  }}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
          )}
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
                <TypeBadgeTrigger ticket={ticket} onPatch={onTypePatch} />
              </fieldset>
              {swapNote !== null && (
                <TemplateSwapNote name={swapNote.name} onUndo={undoSwap} />
              )}
              {ticket.archivedAt !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
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

          <TicketDiscussion ticket={ticket} members={members} />
        </main>

        <aside className="flex min-w-0 flex-col gap-4 sm:pl-(--ticket-rail-inset) lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:[scrollbar-gutter:stable] lg:self-start lg:overflow-y-auto lg:border-l lg:border-border/60 lg:pl-5">
          <fieldset disabled={!canEdit} className="contents">
            <MetaRow label={m.tickets_page_meta_priority()}>
              <PriorityBadgeTrigger ticket={ticket} onPatch={updateTicket} />
            </MetaRow>
            {estimation !== "off" && (
              <MetaRow label={m.tickets_page_meta_estimate()}>
                <EstimateBadgeTrigger
                  ticket={ticket}
                  mode={estimation}
                  onPatch={updateTicket}
                />
              </MetaRow>
            )}
            <PlanningMetaRows ticket={ticket} onPatch={updateTicket} />
            <MetaRow label={m.tickets_page_meta_assignees()}>
              <AssigneePicker
                ticket={ticket}
                members={members}
                onPatch={updateTicket}
              />
            </MetaRow>
            <MetaRow label={m.tickets_page_meta_tags()}>
              <TagEditor
                ticket={ticket}
                canManageTags={actor.call("tags", "create")}
              />
            </MetaRow>
          </fieldset>
          {github && (
            <MetaRow label={m.tickets_page_meta_git()}>
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
          <MetaRow label={m.tickets_page_meta_created()}>
            <UserTimestamp user={ticket.creator} timestamp={ticket.createdAt} />
          </MetaRow>
          <MetaRow label={m.tickets_page_meta_updated()}>
            <UserTimestamp user={ticket.updater} timestamp={ticket.updatedAt} />
          </MetaRow>
        </aside>
      </div>
    </TicketPageShell>
  )
}

function PlanningMetaRows({
  ticket,
  onPatch
}: Readonly<{
  ticket: TicketDetail
  onPatch: (patch: UpdateTicketInput) => void
}>) {
  if (ticket.type === "epic") return null
  return (
    <>
      <MetaRow label={m.tickets_page_meta_sprint()}>
        <SprintBadgeTrigger ticketId={ticket.id} />
      </MetaRow>
      <MetaRow label={m.tickets_page_meta_epic()}>
        <EpicField ticket={ticket} onPatch={onPatch} />
      </MetaRow>
    </>
  )
}
