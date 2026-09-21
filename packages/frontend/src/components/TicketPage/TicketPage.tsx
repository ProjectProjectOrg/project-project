import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { Archive } from "lucide-react"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { useMemo, useState } from "react"
import { CommentsSection } from "@/components/Comments/CommentsSection"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { type SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import { ArchiveTicketControl } from "@/components/TicketList/ArchiveControl"
import { SplitTicketControl } from "@/components/TicketList/SplitControl"
import { AssigneePicker } from "@/components/TicketList/AssigneeField"
import { PriorityBadgeTrigger } from "@/components/TicketList/PriorityField"
import { SprintBadgeTrigger } from "@/components/TicketList/SprintField"
import { TypeBadgeTrigger } from "@/components/TicketList/TypeField"
import { TagEditor } from "@/components/TagEditor"
import { TicketGitPanel } from "@/components/TicketGit"
import { TicketTimeSection } from "@/components/time/TicketTimePanel"
import { DescriptionField } from "@/components/TicketPage/DescriptionField"
import { MetaRow } from "@/components/TicketPage/MetaRow"
import { TicketDesignLinks } from "@/components/TicketPage/TicketDesignLinks"
import { SplitResultBanner } from "@/components/TicketPage/SplitResultBanner"
import { TicketPageHeader } from "@/components/TicketPage/TicketPageHeader"
import { TicketPageShell } from "@/components/TicketPage/TicketPageShell"
import { UserTimestamp } from "@/components/TicketPage/UserTimestamp"
import { useProjectRole } from "@/lib/projectRole"
import { m } from "@/paraglide/messages"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  archiveTicket,
  deleteTicket,
  ticketRequest,
  unarchiveTicket,
  updateTicketDetail
} from "@/atoms/ticketDetail"
import type {
  GithubConnection,
  Member,
  TicketDetail,
  TicketId
} from "@projectproject/shared"

const NO_SPLIT_RESULTS: ReadonlyArray<TicketId> = []

export function TicketPage({
  orgSlug,
  slug,
  ticket,
  members,
  github,
  autoFocusBody = false,
  splitInto = NO_SPLIT_RESULTS
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  github: GithubConnection | null
  autoFocusBody?: boolean
  splitInto?: ReadonlyArray<TicketId>
}) {
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const remove = useAtomSet(deleteTicket(req), { mode: "promiseExit" })
  const updateTicket = useAtomSet(updateTicketDetail(req))
  const updateTicketState = useAtomValue(updateTicketDetail(req))
  const archiveTicketSet = useAtomSet(archiveTicket(req), {
    mode: "promiseExit"
  })
  const archiveState = useAtomValue(archiveTicket(req))
  const unarchiveTicketSet = useAtomSet(unarchiveTicket(req))
  const unarchiveState = useAtomValue(unarchiveTicket(req))
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const { canManageTags } = useProjectRole()

  return (
    <TicketPageShell
      back={{
        to: "/orgs/$orgSlug/projects/$slug",
        params: { orgSlug, slug }
      }}
      actions={
        <>
          <MarkdownSaveIndicator status={bodyStatus} />
          <SplitTicketControl orgSlug={orgSlug} slug={slug} id={ticket.id} />
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
          <ConfirmDeleteIcon
            ariaLabel={m.tickets_detail_delete_aria_label()}
            message={m.tickets_detail_delete_confirm()}
            disabled={deleting}
            onConfirm={async () => {
              setDeleting(true)
              const exit = await remove()
              if (Exit.isSuccess(exit)) {
                void navigate({
                  to: "/orgs/$orgSlug/projects/$slug",
                  params: { orgSlug, slug }
                })
                return
              }
              setDeleting(false)
              throw Cause.squash(exit.cause)
            }}
          />
        </>
      }
      header={
        <TicketPageHeader
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          onPatch={updateTicket}
          waiting={updateTicketState.waiting}
          meta={
            <>
              <TypeBadgeTrigger
                ticket={ticket}
                onPatch={updateTicket}
                waiting={updateTicketState.waiting}
              />
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
      {splitInto.length > 0 && (
        <SplitResultBanner orgSlug={orgSlug} slug={slug} created={splitInto} />
      )}

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="flex min-w-0 flex-col gap-6">
          <DescriptionField
            orgSlug={orgSlug}
            slug={slug}
            ticket={ticket}
            members={members}
            autoFocus={autoFocusBody}
            onStatusChange={setBodyStatus}
          />

          <CommentsSection orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:border-border/60 lg:pl-5 lg:[scrollbar-gutter:stable]">
          <MetaRow label={m.tickets_page_meta_priority()}>
            <PriorityBadgeTrigger
              ticket={ticket}
              onPatch={updateTicket}
              waiting={updateTicketState.waiting}
            />
          </MetaRow>
          <MetaRow label={m.tickets_page_meta_sprint()}>
            <SprintBadgeTrigger
              orgSlug={orgSlug}
              slug={slug}
              ticketId={ticket.id}
            />
          </MetaRow>
          <MetaRow label={m.tickets_page_meta_assignees()}>
            <AssigneePicker
              ticket={ticket}
              members={members}
              onPatch={updateTicket}
              waiting={updateTicketState.waiting}
            />
          </MetaRow>
          <MetaRow label={m.tickets_page_meta_tags()}>
            <TagEditor
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
              canManageTags={canManageTags}
            />
          </MetaRow>
          {github && (
            <MetaRow label={m.tickets_page_meta_git()}>
              <TicketGitPanel
                orgSlug={orgSlug}
                slug={slug}
                ticket={ticket}
                github={github}
                branchTemplate={null}
                variant="ghost"
              />
            </MetaRow>
          )}
          <TicketDesignLinks orgSlug={orgSlug} slug={slug} ticket={ticket} />
          <TicketTimeSection orgSlug={orgSlug} slug={slug} ticket={ticket} />
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
