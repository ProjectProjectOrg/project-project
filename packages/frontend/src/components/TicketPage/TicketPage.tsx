import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { useEffect, useState, type KeyboardEvent } from "react"
import { CommentsSection } from "@/components/Comments/CommentsSection"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { AssigneePicker } from "@/components/TicketList/AssigneeField"
import { PriorityBadgeTrigger } from "@/components/TicketList/PriorityField"
import { SprintBadgeTrigger } from "@/components/TicketList/SprintField"
import { StatusButton } from "@/components/TicketList/StatusField"
import { TypeBadgeTrigger } from "@/components/TicketList/TypeField"
import { TagEditor } from "@/components/TagEditor"
import { TicketGitPanel } from "@/components/TicketGit"
import { useProjectRole } from "@/lib/projectRole"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import {
  deleteTicketAtom,
  ticketKey,
  updateTicketAtom
} from "@/atoms/tickets"
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
  const update = useAtomSet(updateTicketAtom(tKey))
  const locale = getLocale()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-start gap-3">
        <StatusButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          size="lg"
        />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <TitleField orgSlug={orgSlug} slug={slug} ticket={ticket} />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {ticket.id}
            </span>
            <TypeBadgeTrigger
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
            />
          </div>
        </div>
        <SaveIndicator status={bodyStatus} />
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

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="flex min-w-0 flex-col gap-8">
          <div className="rounded-lg border border-transparent px-3 py-2 transition-colors duration-150 focus-within:border-border focus-within:bg-background">
            <MentionScopeProvider scope={{ orgSlug, slug, members }}>
              <LexicalEditor
                key={`${slug}/${ticket.id}`}
                markdown={ticket.body}
                onChange={(next) => update({ body: next })}
                onStatusChange={setBodyStatus}
                autoFocus={autoFocusBody}
              />
            </MentionScopeProvider>
          </div>

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

function TitleField({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const tKey = ticketKey(orgSlug, slug, ticket.id)
  const update = useAtomSet(updateTicketAtom(tKey), { mode: "promiseExit" })
  const updateState = useAtomValue(updateTicketAtom(tKey))
  const saving = updateState.waiting
  const failed = Result.isFailure(updateState)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ticket.title)

  useEffect(() => {
    if (!editing) setDraft(ticket.title)
  }, [editing, ticket.title])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === ticket.title) {
      setEditing(false)
      setDraft(ticket.title)
      return
    }
    await update({ title: trimmed })
    setEditing(false)
  }
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setDraft(ticket.title)
      setEditing(false)
    }
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-1.5 block w-full truncate rounded px-1.5 text-left text-2xl font-semibold tracking-tight transition-colors hover:bg-accent/40"
      >
        <span className={saving || failed ? "animate-pulse" : undefined}>
          {ticket.title}
        </span>
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKey}
      className="-mx-1.5 block w-full rounded bg-transparent px-1.5 text-2xl font-semibold tracking-tight outline-none ring-2 ring-ring/50"
      maxLength={200}
      aria-label={m.tickets_title_aria_label()}
    />
  )
}

const SAVE_STATUS_LABELS = {
  saving: m.tickets_save_status_saving,
  dirty: m.tickets_save_status_dirty,
  saved: m.tickets_save_status_saved
} as const

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null
  const label = SAVE_STATUS_LABELS[status]()
  return (
    <span className="self-center text-xs text-muted-foreground tabular-nums">
      {label}
    </span>
  )
}
