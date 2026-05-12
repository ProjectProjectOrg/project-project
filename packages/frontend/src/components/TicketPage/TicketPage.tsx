import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link, useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { ChevronLeft } from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent
} from "react"
import { CommentsSection } from "@/components/Comments/CommentsSection"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { cn } from "@/lib/utils"
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
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/orgs/$orgSlug/projects/$slug"
          params={{ orgSlug, slug }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
          <span>{m.tickets_page_back_to_backlog()}</span>
        </Link>
        <SaveIndicator status={bodyStatus} />
      </div>
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
          <DescriptionField
            orgSlug={orgSlug}
            slug={slug}
            members={members}
            editorKey={`${slug}/${ticket.id}`}
            markdown={ticket.body}
            autoFocus={autoFocusBody}
            onChange={(next) => update({ body: next })}
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
        className="-mx-1.5 block w-full rounded px-1.5 text-left text-2xl font-semibold tracking-tight transition-colors hover:bg-accent/40"
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
    <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
  )
}

function DescriptionField({
  orgSlug,
  slug,
  members,
  editorKey,
  markdown,
  autoFocus,
  onChange,
  onStatusChange
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  editorKey: string
  markdown: string
  autoFocus: boolean
  onChange: (next: string) => void
  onStatusChange: (status: SaveStatus) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    const inner = contentRef.current
    const outer = wrapperRef.current
    if (!inner || !outer) return
    const measure = () => {
      const vh = window.innerHeight
      const h = outer.scrollHeight + 2
      setViewportHeight(vh)
      setContentHeight(h)
      setOverflows(h > vh * 0.5)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(inner)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  const collapsed = overflows && !expanded && !focused
  const targetPx = collapsed
    ? Math.round(viewportHeight * 0.5)
    : contentHeight

  return (
    <div>
      <div
        ref={wrapperRef}
        className="relative overflow-hidden rounded-lg border border-transparent px-3 py-2 focus-within:border-border focus-within:bg-background"
        style={{
          maxHeight: targetPx > 0 ? `${targetPx}px` : undefined,
          transition: focused
            ? "background-color 150ms, border-color 150ms"
            : "max-height 350ms cubic-bezier(0.2, 0, 0, 1), background-color 150ms, border-color 150ms"
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
        }}
      >
        <div ref={contentRef}>
          <MentionScopeProvider scope={{ orgSlug, slug, members }}>
            <LexicalEditor
              key={editorKey}
              markdown={markdown}
              onChange={onChange}
              onStatusChange={onStatusChange}
              autoFocus={autoFocus}
            />
          </MentionScopeProvider>
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-muted transition-opacity duration-200",
            collapsed ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
      {overflows && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(collapsed)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-all duration-150 hover:bg-accent/40 hover:text-foreground active:scale-[0.97]"
          >
            {collapsed ? m.tickets_page_read_more() : m.tickets_page_show_less()}
          </button>
        </div>
      )}
    </div>
  )
}
