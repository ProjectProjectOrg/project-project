import { useAtomSet } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { useState } from "react"
import { BackButton } from "@/components/BackButton"
import { CommentsSection } from "@/components/Comments/CommentsSection"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { type SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import { AssigneePicker } from "@/components/TicketList/AssigneeField"
import { PriorityBadgeTrigger } from "@/components/TicketList/PriorityField"
import { SprintBadgeTrigger } from "@/components/TicketList/SprintField"
import { StatusButton } from "@/components/TicketList/StatusField"
import { TypeBadgeTrigger } from "@/components/TicketList/TypeField"
import { TagEditor } from "@/components/TagEditor"
import { TicketGitPanel } from "@/components/TicketGit"
import { DescriptionField } from "@/components/TicketPage/DescriptionField"
import { TitleField } from "@/components/TicketPage/TitleField"
import { useProjectRole } from "@/lib/projectRole"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import { deleteTicketAtom, ticketKey } from "@/atoms/tickets"
import type {
  GithubConnection,
  Member,
  TicketDetail
} from "@projectproject/shared"

export function TicketPage({
  orgSlug,
  slug,
  ticket,
  members,
  github,
  autoFocusBody = false
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  github: GithubConnection | null
  autoFocusBody?: boolean
}) {
  const tKey = ticketKey(orgSlug, slug, ticket.id)
  const remove = useAtomSet(deleteTicketAtom(tKey), { mode: "promiseExit" })
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const { canManageTags } = useProjectRole()
  const locale = getLocale()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <BackButton
          fallback={{
            to: "/orgs/$orgSlug/projects/$slug",
            params: { orgSlug, slug }
          }}
        />
        <MarkdownSaveIndicator status={bodyStatus} />
      </div>
      <header className="flex items-start gap-3">
        <StatusButton orgSlug={orgSlug} slug={slug} ticket={ticket} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <h1 className="w-full">
            <TitleField orgSlug={orgSlug} slug={slug} ticket={ticket} />
          </h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {ticket.id}
            </span>
            <TypeBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
          </div>
        </div>
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
      </header>

      <div className="h-px bg-border/60" />

      <div className="grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="flex min-w-0 flex-col gap-8">
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

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-border/60 lg:pl-6">
          <MetaRow label={m.tickets_page_meta_priority()}>
            <PriorityBadgeTrigger
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
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
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
              members={members}
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
          <MetaRow label={m.tickets_page_meta_created()}>
            <time
              dateTime={ticket.createdAt.toISOString()}
              title={ticket.createdAt.toLocaleString(locale)}
              className="text-xs"
            >
              {ticket.createdAt.toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric"
              })}
            </time>
          </MetaRow>
          <MetaRow label={m.tickets_page_meta_updated()}>
            <time
              dateTime={ticket.updatedAt.toISOString()}
              title={ticket.updatedAt.toLocaleString(locale)}
              className="text-xs"
            >
              {ticket.updatedAt.toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric"
              })}
            </time>
          </MetaRow>
        </aside>
      </div>
    </div>
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
