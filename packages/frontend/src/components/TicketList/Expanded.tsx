import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { Cause, Exit } from "effect"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { TagEditor } from "@/components/TagEditor"
import { TicketGitPanel } from "@/components/TicketGit"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import {
  deleteTicketAtom,
  ticketAtom,
  ticketKey,
  updateTicketAtom
} from "@/atoms/tickets"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { MentionScopeProvider } from "@/mentions/scope"
import { CommentsSection } from "@/components/Comments/CommentsSection"
import { useProjectRole } from "@/lib/projectRole"
import { getInputAttrs } from "@/lib/schema-form"
import {
  TicketTitle,
  type Member,
  type TicketDetail,
  type TicketId
} from "@projectproject/shared"
import { AssigneePicker } from "./AssigneeField"
import { PriorityBadgeTrigger } from "./PriorityField"
import { TypeBadgeTrigger } from "./TypeField"

const titleAttrs = getInputAttrs(TicketTitle)

export function Expanded({
  orgSlug,
  slug,
  id,
  members,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  id: TicketId
  members: ReadonlyArray<Member>
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const detail = useAtomValue(ticketAtom(ticketKey(orgSlug, slug, id)))
  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-4">
      {Result.matchWithError(detail, {
        onInitial: () => (
          <div className="skeleton h-24 rounded-lg bg-muted/60" />
        ),
        onError: (error) => (
          <p className="text-sm text-muted-foreground">
            {m.tickets_detail_load_error({ error: error._tag })}
          </p>
        ),
        onDefect: (defect) => (
          <p className="text-sm text-muted-foreground">
            {m.tickets_detail_defect({ defect: String(defect) })}
          </p>
        ),
        onSuccess: ({ value }) => (
          <ExpandedDetail
            orgSlug={orgSlug}
            slug={slug}
            ticket={value}
            members={members}
            focusBody={focusBody}
            onConsumeFocusBody={onConsumeFocusBody}
          />
        )
      })}
    </div>
  )
}

function ExpandedDetail({
  orgSlug,
  slug,
  ticket,
  members,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const tKey = ticketKey(orgSlug, slug, ticket.id)
  const update = useAtomSet(updateTicketAtom(tKey))
  const remove = useAtomSet(deleteTicketAtom(tKey), { mode: "promiseExit" })
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const autoFocusBody = useRef(focusBody).current
  useEffect(() => {
    if (focusBody) onConsumeFocusBody()
  }, [focusBody, onConsumeFocusBody])

  const { canManageTags } = useProjectRole()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleField orgSlug={orgSlug} slug={slug} ticket={ticket} />
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
              navigate({
                to: ".",
                search: (prev) => ({ ...(prev as object), ticket: undefined }),
                replace: true
              })
              return
            }
            setDeleting(false)
            throw Cause.squash(exit.cause)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PriorityBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
        <TypeBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
        <AssigneePicker
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
        />
        <span className="ml-auto flex items-center gap-2">
          <span title={ticket.createdAt.toLocaleString(getLocale())}>
            {m.tickets_detail_created({
              date: ticket.createdAt.toLocaleDateString(getLocale())
            })}
          </span>
          <span>·</span>
          <span title={ticket.updatedAt.toLocaleString(getLocale())}>
            {m.tickets_detail_updated({
              date: ticket.updatedAt.toLocaleDateString(getLocale())
            })}
          </span>
        </span>
      </div>

      <TagEditor
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        canManageTags={canManageTags}
      />

      <ExpandedGitPanel orgSlug={orgSlug} slug={slug} ticket={ticket} />

      <div className="rounded-lg border border-border bg-background px-3 py-2">
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
    </div>
  )
}

function ExpandedGitPanel({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const project = useProject()
  if (!project.github) return null
  return (
    <TicketGitPanel
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      github={project.github}
      branchTemplate={null}
    />
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
        className="-mx-1 truncate rounded px-1 text-left text-base font-semibold tracking-tight transition-colors hover:bg-accent/40"
      >
        {ticket.title}
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
      className="-mx-1 w-full rounded bg-transparent px-1 text-base font-semibold tracking-tight outline-none ring-2 ring-ring/50"
      maxLength={titleAttrs.maxLength}
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
