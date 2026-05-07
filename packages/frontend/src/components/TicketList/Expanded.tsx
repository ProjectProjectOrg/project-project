import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { Markdown } from "@/components/Markdown"
import { TagEditor } from "@/components/TagEditor"
import { TicketGitPanel } from "@/components/TicketGit"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { meAtom } from "@/atoms/auth"
import {
  deleteTicketAtom,
  ticketAtom,
  ticketKey,
  updateTicketAtom,
  type TicketConflict
} from "@/atoms/tickets"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { cn } from "@/lib/utils"
import type { Member, TicketDetail, TicketId } from "@projectproject/shared"
import { AssigneePicker } from "./AssigneeField"
import { PriorityBadgeTrigger } from "./PriorityField"
import { TypeBadgeTrigger } from "./TypeField"

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
            Couldn't load detail: {error._tag}
          </p>
        ),
        onDefect: (defect) => (
          <p className="text-sm text-muted-foreground">
            Something went wrong: {String(defect)}
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
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const remove = useAtomSet(deleteTicketAtom, { mode: "promise" })
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [deleting, setDeleting] = useState(false)
  const [fieldConflict, setFieldConflict] = useState<TicketConflict | null>(
    null
  )
  const [localDraft, setLocalDraft] = useState(ticket.body)
  const [editorBaseBody, setEditorBaseBody] = useState(ticket.body)
  const [editorRemountKey, setEditorRemountKey] = useState(0)
  const [bodyConflict, setBodyConflict] = useState<TicketConflict | null>(null)
  const [keepingMine, setKeepingMine] = useState(false)
  const navigate = useNavigate()
  const autoFocusBody = useRef(focusBody).current
  useEffect(() => {
    if (focusBody) onConsumeFocusBody()
  }, [focusBody, onConsumeFocusBody])

  const project = useProject()
  const me = useAtomValue(meAtom)
  const myRole = Result.isSuccess(me)
    ? (project.members.find((m) => m.id === me.value.id)?.role ?? "member")
    : "member"
  const canManageTags = myRole === "owner" || myRole === "admin"

  async function handleBodyChange(next: string) {
    const result = await update({
      baseVersion: ticket.version,
      body: next
    })
    if (result._tag === "Conflict") setBodyConflict(result.conflict)
  }

  async function keepMine() {
    if (!bodyConflict || keepingMine) return
    const remoteVersion = bodyConflict.remote.version
    const next = localDraft
    setBodyConflict(null)
    setKeepingMine(true)
    try {
      const result = await update({
        baseVersion: remoteVersion,
        body: next
      })
      if (result._tag === "Conflict") setBodyConflict(result.conflict)
    } finally {
      setKeepingMine(false)
    }
  }

  function useLatest() {
    if (!bodyConflict) return
    setEditorBaseBody(bodyConflict.remote.body)
    setEditorRemountKey((k) => k + 1)
    setLocalDraft(bodyConflict.remote.body)
    setBodyConflict(null)
  }

  function editManually() {
    setBodyConflict(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleField
            orgSlug={orgSlug}
            slug={slug}
            ticket={ticket}
            onConflict={setFieldConflict}
          />
        </div>
        {fieldConflict && (
          <FieldConflictStrip
            conflict={fieldConflict}
            onDismiss={() => setFieldConflict(null)}
          />
        )}
        <SaveIndicator status={bodyConflict ? "conflict" : bodyStatus} />
        <ConfirmDeleteIcon
          ariaLabel="Delete ticket"
          message="Delete this ticket?"
          disabled={deleting}
          onConfirm={async () => {
            setDeleting(true)
            try {
              const result = await remove({
                orgSlug,
                slug,
                id: ticket.id,
                baseVersion: ticket.version
              })
              if (result._tag === "Conflict") {
                setFieldConflict(result.conflict)
                setDeleting(false)
                return
              }
              navigate({
                to: ".",
                search: (prev) => ({ ...(prev as object), ticket: undefined }),
                replace: true
              })
            } catch (e) {
              setDeleting(false)
              throw e
            }
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PriorityBadgeTrigger
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          onConflict={setFieldConflict}
        />
        <TypeBadgeTrigger
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          onConflict={setFieldConflict}
        />
        <AssigneePicker
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
          onConflict={setFieldConflict}
        />
        <span className="ml-auto flex items-center gap-2">
          <span title={ticket.createdAt.toLocaleString()}>
            created {ticket.createdAt.toLocaleDateString()}
          </span>
          <span>·</span>
          <span title={ticket.updatedAt.toLocaleString()}>
            updated {ticket.updatedAt.toLocaleDateString()}
          </span>
        </span>
      </div>

      <TagEditor
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        canManageTags={canManageTags}
        onConflict={setFieldConflict}
      />

      <ExpandedGitPanel orgSlug={orgSlug} slug={slug} ticket={ticket} />

      {bodyConflict && (
        <BodyConflictPanel
          remoteBody={bodyConflict.remote.body}
          onKeepMine={() => void keepMine()}
          onUseLatest={useLatest}
          onEditManually={editManually}
          busy={keepingMine}
        />
      )}

      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <LexicalEditor
          key={`${slug}/${ticket.id}/${editorRemountKey}`}
          markdown={editorBaseBody}
          onChange={handleBodyChange}
          onLocalDraftChange={setLocalDraft}
          onStatusChange={setBodyStatus}
          paused={!!bodyConflict}
          autoFocus={autoFocusBody}
        />
      </div>
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
  ticket,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ticket.title)
  const [saving, setSaving] = useState(false)
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
    setSaving(true)
    try {
      const result = await update({
        baseVersion: ticket.version,
        title: trimmed
      })
      if (result._tag === "Conflict") onConflict?.(result.conflict)
    } finally {
      setSaving(false)
      setEditing(false)
    }
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
      maxLength={200}
      aria-label="Ticket title"
    />
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "saved"
          ? "Saved"
          : status === "conflict"
            ? "Changed elsewhere"
            : null
  if (!label) return null
  return (
    <span
      className={cn(
        "self-center text-xs tabular-nums",
        status === "conflict"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}

function FieldConflictStrip({
  conflict,
  onDismiss
}: {
  conflict: TicketConflict
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [conflict, onDismiss])
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 self-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
    >
      <AlertTriangle className="size-3" strokeWidth={2} />
      <span>Changed elsewhere — refreshed</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-0.5 inline-grid size-3.5 place-items-center rounded-full transition-colors duration-100 hover:bg-amber-500/20 active:scale-[0.9]"
      >
        <X className="size-2.5" strokeWidth={2.25} />
      </button>
    </span>
  )
}

function BodyConflictPanel({
  remoteBody,
  onKeepMine,
  onUseLatest,
  onEditManually,
  busy
}: {
  remoteBody: string
  onKeepMine: () => void
  onUseLatest: () => void
  onEditManually: () => void
  busy: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          strokeWidth={2}
        />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Changed elsewhere</h3>
          <p className="text-xs text-muted-foreground">
            Someone updated this ticket while you were editing. Pick how to
            reconcile.
          </p>
        </div>
      </div>
      <div className="rounded-md border border-border bg-background p-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Latest saved
        </div>
        <div className="max-h-48 overflow-y-auto">
          <Markdown>{remoteBody}</Markdown>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onKeepMine}
          disabled={busy}
        >
          {busy ? "Saving…" : "Keep mine"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onUseLatest}
          disabled={busy}
        >
          Use latest
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEditManually}
          disabled={busy}
        >
          Edit manually
        </Button>
      </div>
    </div>
  )
}
