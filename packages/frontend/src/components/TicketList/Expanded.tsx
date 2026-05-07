import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { TagEditor } from "@/components/TagEditor"
import { TicketGitPanel } from "@/components/TicketGit"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { meAtom } from "@/atoms/auth"
import {
  deleteTicketAtom,
  ticketAtom,
  ticketKey,
  updateTicketAtom
} from "@/atoms/tickets"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
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
  const update = useAtomSet(updateTicketAtom)
  const remove = useAtomSet(deleteTicketAtom)
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [lastSavedVersion, setLastSavedVersion] = useState(ticket.version)
  const [localDraft, setLocalDraft] = useState(ticket.body)
  const [conflictRemote, setConflictRemote] = useState<TicketDetail | null>(
    null
  )
  const [editorKey, setEditorKey] = useState(`${slug}/${ticket.id}`)
  const [deleting, setDeleting] = useState(false)
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
  const inConflict = conflictRemote !== null

  useEffect(() => {
    if (!inConflict) {
      setLastSavedVersion(ticket.version)
      setLocalDraft(ticket.body)
    }
  }, [inConflict, ticket.body, ticket.version])

  async function saveBody(markdown: string, baseVersion = lastSavedVersion) {
    try {
      await update({
        orgSlug,
        slug,
        id: ticket.id,
        baseVersion,
        body: markdown
      })
      const saved = await fetchTicketHttp(orgSlug, slug, ticket.id)
      setLastSavedVersion(saved.version)
      setConflictRemote(null)
      setBodyStatus("saved")
    } catch (e) {
      if (isTicketChanged(e)) {
        const latest = await fetchTicketHttp(orgSlug, slug, ticket.id)
        setConflictRemote(latest)
        setBodyStatus("conflict")
        throw e
      }
      throw e
    }
  }

  async function keepMine() {
    if (!conflictRemote) return
    await saveBody(localDraft, conflictRemote.version)
  }

  function useLatest() {
    if (!conflictRemote) return
    setLocalDraft(conflictRemote.body)
    setLastSavedVersion(conflictRemote.version)
    setConflictRemote(null)
    setBodyStatus("idle")
    setEditorKey(`${slug}/${ticket.id}/${conflictRemote.version}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleField orgSlug={orgSlug} slug={slug} ticket={ticket} />
        </div>
        <SaveIndicator status={bodyStatus} />
        <ConfirmDeleteIcon
          ariaLabel="Delete ticket"
          message="Delete this ticket?"
          disabled={deleting}
          onConfirm={async () => {
            setDeleting(true)
            try {
              await remove({
                orgSlug,
                slug,
                id: ticket.id,
                baseVersion: ticket.version
              })
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
        <PriorityBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
        <TypeBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
        <AssigneePicker
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
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
      />

      <ExpandedGitPanel orgSlug={orgSlug} slug={slug} ticket={ticket} />

      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <LexicalEditor
          key={editorKey}
          markdown={localDraft}
          onChange={(next) => saveBody(next)}
          onLocalDraftChange={setLocalDraft}
          onStatusChange={setBodyStatus}
          autoFocus={autoFocusBody}
          paused={inConflict}
        />
      </div>
      {conflictRemote && (
        <div className="grid gap-3 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20 md:grid-cols-2">
          <ConflictPane title="Your draft" body={localDraft} />
          <ConflictPane title="Latest saved" body={conflictRemote.body} />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => void keepMine()}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={useLatest}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
            >
              Use latest
            </button>
            <button
              type="button"
              onClick={() => void saveBody(localDraft, conflictRemote.version)}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
            >
              Edit manually
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function isTicketChanged(error: unknown): error is { _tag: "TicketChanged" } {
  return (
    !!error &&
    typeof error === "object" &&
    "_tag" in error &&
    error._tag === "TicketChanged"
  )
}

async function fetchTicketHttp(
  orgSlug: string,
  slug: string,
  id: TicketId
): Promise<TicketDetail> {
  const res = await fetch(
    `/api/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(id)}`
  )
  if (!res.ok) throw new Error(`Failed to refresh ticket: ${res.status}`)
  return (await res.json()) as TicketDetail
}

function ConflictPane({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-xs">
        {body}
      </pre>
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
  const update = useAtomSet(updateTicketAtom)
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
      await update({
        orgSlug,
        slug,
        id: ticket.id,
        baseVersion: ticket.version,
        title: trimmed
      })
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
      : status === "conflict"
        ? "Changed elsewhere"
        : status === "dirty"
          ? "Unsaved changes"
          : status === "saved"
            ? "Saved"
            : null
  if (!label) return null
  return (
    <span className="self-center text-xs text-muted-foreground tabular-nums">
      {label}
    </span>
  )
}
