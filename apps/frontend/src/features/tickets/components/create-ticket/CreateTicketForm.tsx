import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { type GroupId, type TicketId, isEpicType } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Input } from "@pp/ui/input"
import { PopoverClose } from "@pp/ui/popover"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react"

import { fireMutation } from "@/api/viewMutation"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import {
  projectRequest,
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectSelect } from "@/features/projects/components/ProjectSelect"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import {
  assignTicketToSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  createTicketInProject,
  relatedPayload,
  type CreateTicketRequest,
  type RelatedKind
} from "@/features/tickets/atoms/createTicket"
import {
  markTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { SprintSelect } from "@/features/tickets/components/ticket-list/SprintField"
import { startText } from "@/features/tickets/components/ticket-list/StartsWithLine"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import {
  DEFAULT_TICKET_FIELDS,
  TicketFieldChips,
  ticketFieldsPayload,
  type TicketFields
} from "./TicketFieldChips"

const RELATED_LABELS: Readonly<
  Record<RelatedKind, (args: { id: string }) => string>
> = {
  subTicket: m.tickets_create_related_sub_ticket,
  blockedBy: m.tickets_create_related_blocks,
  blocking: m.tickets_create_related_blocked_by,
  related: m.tickets_create_related_related
}

// The full new-ticket composer: on cmd+k's New ticket page, and in a popover
// from the ticket menu's "Create related" (the ticket it relates to is in the
// request).
export function CreateTicketForm({
  request,
  onDone,
  inCommandMenu = false
}: Readonly<{
  request: CreateTicketRequest
  onDone: () => void
  // In cmd+k the composer shows its header with the project picker, and
  // Cancel goes back instead of closing a popover.
  inCommandMenu?: boolean
}>) {
  const { orgSlug } = request
  const navigate = useNavigate()
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(projectsResult) ? projectsResult.value : []
  const [picked, setPicked] = useState(request.projectSlug)
  const slug = picked ?? projects[0]?.slug ?? null
  const related =
    request.related !== undefined && slug === request.projectSlug
      ? request.related
      : null

  const titleInput = useRef<HTMLInputElement>(null)
  useEffect(() => titleInput.current?.focus(), [])
  const [title, setTitle] = useState(request.title ?? "")
  const [description, setDescription] = useState("")
  const creatorType = useCreatorType({
    orgSlug,
    slug: slug ?? "",
    epics: related?.kind !== "subTicket"
  })
  const [fields, setFields] = useState<TicketFields>(DEFAULT_TICKET_FIELDS)
  const [sprint, setSprint] = useState<GroupId | null>(request.sprint ?? null)
  const registry = useContext(RegistryContext)
  const [failure, setFailure] = useState<string | null>(null)
  const [created, setCreated] = useState<TicketId | null>(null)
  const [pending, setPending] = useState(false)
  const create = useAtomSet(createTicketInProject, { mode: "promiseExit" })
  const trimmed = title.trim()
  const body = description.trim()
  const canSubmit = slug !== null && trimmed !== "" && !pending

  const createTicket = async () => {
    const exit = await create({
      orgSlug,
      slug,
      payload: {
        title: trimmed,
        ...ticketFieldsPayload(fields),
        ...creatorType.payload,
        body: body === "" ? undefined : body,
        ...relatedPayload(related)
      }
    })
    creatorType.settle(exit)
    if (Exit.isSuccess(exit)) return exit.value.id
    setFailure(errorMessage(Cause.squash(exit.cause)))
    return null
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit) return
    setFailure(null)
    setPending(true)
    const id = created ?? (await createTicket())
    if (id === null) {
      setPending(false)
      return
    }
    setCreated(id)
    if (related?.kind === "blockedBy") {
      const marked = await fireMutation(
        registry,
        markTicket(ticketRequest(orgSlug, slug, related.ticketId)),
        { kind: "blockedBy", target: id }
      )
      if (Result.isFailure(marked)) {
        setPending(false)
        setFailure(errorMessage(Cause.squash(marked.cause)))
        return
      }
    }
    if (sprint !== null && !isEpicType(creatorType.type)) {
      assignTicketToSprint(
        registry,
        sprintListRequest(orgSlug, slug),
        id,
        sprint
      )
    }
    onDone()
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id },
      search: body === "" ? { focusBody: "1" } : {}
    })
  }

  const onSubmitShortcut = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col">
      {inCommandMenu ? (
        <Composer.Header>
          <ProjectSelect
            projects={projects}
            value={slug}
            onChange={(next) => {
              setPicked(next)
              creatorType.reset()
              setFields(DEFAULT_TICKET_FIELDS)
              setCreated(null)
              setSprint(null)
            }}
          />
          <h2 className="text-body font-normal text-muted-foreground">
            {m.tickets_create_dialog_title()}
          </h2>
          {related !== null && (
            <span className="truncate text-body text-muted-foreground">
              ·{" "}
              <TicketIdText id={related.ticketId}>
                {RELATED_LABELS[related.kind]({ id: related.ticketId })}
              </TicketIdText>
            </span>
          )}
        </Composer.Header>
      ) : (
        related !== null && (
          <Composer.Header>
            <span className="truncate">
              <TicketIdText id={related.ticketId}>
                {RELATED_LABELS[related.kind]({ id: related.ticketId })}
              </TicketIdText>
            </span>
          </Composer.Header>
        )
      )}
      <Composer.Title>
        <Input
          variant="bare"
          aria-label={m.tickets_create_title_aria_label()}
          aria-required
          placeholder={m.tickets_create_dialog_title_placeholder()}
          value={title}
          maxLength={200}
          onKeyDown={onSubmitShortcut}
          onChange={(event) => {
            setTitle(event.target.value)
            setFailure(null)
          }}
          ref={titleInput}
        />
      </Composer.Title>
      <Composer.Body onKeyDownCapture={onSubmitShortcut}>
        <MentionScopeProvider scope={{ orgSlug, slug: slug ?? "" }}>
          <LexicalEditor
            markdown=""
            onDraftChange={setDescription}
            placeholder={m.tickets_create_dialog_description_placeholder()}
          />
        </MentionScopeProvider>
      </Composer.Body>
      <Composer.Error>{failure}</Composer.Error>
      <Composer.Tray>
        {slug === null ? null : (
          <Composer.Fields>
            <ProjectScope orgSlug={orgSlug} slug={slug}>
              <TicketFieldChips
                key={slug}
                orgSlug={orgSlug}
                slug={slug}
                creatorType={creatorType}
                value={fields}
                onChange={(patch) =>
                  setFields((current) => ({ ...current, ...patch }))
                }
              />
              {!isEpicType(creatorType.type) && (
                <SprintSelect value={sprint} onChange={setSprint} />
              )}
            </ProjectScope>
          </Composer.Fields>
        )}
        <Composer.Footer>
          {body === "" && (
            <Composer.Hint>{startText(creatorType.start)}</Composer.Hint>
          )}
          <Composer.Actions>
            {inCommandMenu ? (
              <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                {m.common_cancel_button()}
              </Button>
            ) : (
              <PopoverClose
                render={<Button type="button" variant="ghost" size="sm" />}
              >
                {m.common_cancel_button()}
              </PopoverClose>
            )}
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {m.tickets_create_dialog_submit()}
            </Button>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}

function ProjectScope({
  orgSlug,
  slug,
  children
}: Readonly<{ orgSlug: string; slug: string; children: ReactNode }>) {
  const request = useMemo(() => projectRequest(orgSlug, slug), [orgSlug, slug])
  return (
    <ProjectContext.Provider value={request}>
      {children}
    </ProjectContext.Provider>
  )
}
