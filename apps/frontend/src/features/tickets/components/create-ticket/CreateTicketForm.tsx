import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  EPIC_TYPE,
  type GroupId,
  type LinkedTicket,
  type TicketId,
  isEpicType
} from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { Input } from "@pp/ui/input"
import { PopoverClose } from "@pp/ui/popover"
import { useNavigate } from "@tanstack/react-router"
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
  justCreatedTicket,
  relatedPayload,
  type CreateTicketRequest,
  type RelatedKind
} from "@/features/tickets/atoms/createTicket"
import {
  markTicket,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { SprintSelect } from "@/features/tickets/components/ticket-list/SprintField"
import { startText } from "@/features/tickets/components/ticket-list/StartsWithLine"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import { linkedTicket } from "@/features/tickets/lib/relationGroups"
import { parentRef } from "@/features/tickets/lib/ticketPatch"
import { m } from "@/paraglide/messages"

import {
  DEFAULT_TICKET_FIELDS,
  TicketFieldChips,
  ticketFieldsPayload,
  type TicketFields
} from "./TicketFieldChips"
import { Submission, useCreateSubmission } from "./useCreateSubmission"

const RELATED_LABELS: Readonly<
  Record<RelatedKind, (args: { id: string }) => string>
> = {
  subTicket: m.tickets_create_related_sub_ticket,
  blockedBy: m.tickets_create_related_blocks,
  blocking: m.tickets_create_related_blocked_by,
  related: m.tickets_create_related_related,
  epicOf: m.tickets_create_epic_for
}

// A ticket made from an inline field, a ticket or a comment shows up where
// it was made, so the page stays; any other new ticket opens.
const staysOnPage = (request: CreateTicketRequest) =>
  request.from === "inline" ||
  request.related !== undefined ||
  request.fromComment !== undefined

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

  const makingEpic = related?.kind === "epicOf"

  const titleInput = useRef<HTMLInputElement>(null)
  useEffect(() => titleInput.current?.focus(), [])
  const [title, setTitle] = useState(request.title ?? "")
  const [description, setDescription] = useState(request.body ?? "")
  const fromComment =
    slug === request.projectSlug ? request.fromComment : undefined
  const creatorType = useCreatorType({
    orgSlug,
    slug: slug ?? "",
    epics: related?.kind !== "subTicket",
    initial: request.type
  })
  const [fields, setFields] = useState<TicketFields>(DEFAULT_TICKET_FIELDS)
  const [sprint, setSprint] = useState<GroupId | null>(request.sprint ?? null)
  const registry = useContext(RegistryContext)
  const create = useAtomSet(createTicketInProject, { mode: "promiseExit" })
  const trimmed = title.trim()
  const body = description.trim()

  const createTicket = async () => {
    const exit = await create({
      orgSlug,
      slug,
      payload: {
        title: trimmed,
        ...ticketFieldsPayload(fields),
        ...creatorType.payload,
        body: body === "" ? undefined : body,
        ...relatedPayload(related),
        fromComment
      }
    })
    creatorType.settle(exit)
    return Exit.map(exit, linkedTicket)
  }

  const link = async (target: LinkedTicket) => {
    if (related?.kind === "epicOf") {
      const moved = await fireMutation(
        registry,
        updateTicketDetail(ticketRequest(orgSlug, slug, related.ticketId)),
        {
          parent: parentRef({
            id: target.id,
            title: target.title,
            type: EPIC_TYPE
          })
        }
      )
      return Result.isFailure(moved) ? Exit.failCause(moved.cause) : Exit.void
    }
    if (related?.kind !== "blockedBy") return Exit.void
    const marked = await fireMutation(
      registry,
      markTicket(ticketRequest(orgSlug, slug, related.ticketId)),
      { kind: "blockedBy", target }
    )
    return Result.isFailure(marked) ? Exit.failCause(marked.cause) : Exit.void
  }

  const done = (id: TicketId) => {
    if (sprint !== null && !isEpicType(creatorType.type)) {
      assignTicketToSprint(
        registry,
        sprintListRequest(orgSlug, slug),
        id,
        sprint
      )
    }
    onDone()
    if (staysOnPage(request)) {
      registry.set(justCreatedTicket, { id, at: performance.now() })
      return
    }
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id },
      search: body === "" ? { focusBody: "1" } : {}
    })
  }

  const {
    submission,
    locked,
    submit: submitCreate,
    clearFailure
  } = useCreateSubmission({ create: createTicket, link, done })
  const linkFailed = Submission.$is("linkFailed")(submission)
  const canSubmit = slug !== null && trimmed !== "" && (!locked || linkFailed)

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (canSubmit) void submitCreate()
  }

  const onSubmitShortcut = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      {inCommandMenu ? (
        <Composer.Header>
          <ProjectSelect
            orgSlug={orgSlug}
            projects={projects}
            value={slug}
            readOnly={locked || makingEpic}
            onChange={(next) => {
              setPicked(next)
              creatorType.reset()
              setFields(DEFAULT_TICKET_FIELDS)
              setSprint(null)
            }}
          />
          {makingEpic ? (
            <h2 className="truncate text-body font-normal text-muted-foreground">
              <TicketIdText id={related.ticketId}>
                {m.tickets_create_epic_for({ id: related.ticketId })}
              </TicketIdText>
            </h2>
          ) : (
            <h2 className="text-body font-normal text-muted-foreground">
              {m.tickets_create_dialog_title()}
            </h2>
          )}
          {related !== null && related.kind !== "epicOf" && (
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
          readOnly={locked}
          onKeyDown={onSubmitShortcut}
          onChange={(event) => {
            setTitle(event.target.value)
            clearFailure()
          }}
          ref={titleInput}
        />
      </Composer.Title>
      <Composer.Body onKeyDownCapture={onSubmitShortcut}>
        <MentionScopeProvider scope={{ orgSlug, slug: slug ?? "" }}>
          <LexicalEditor
            markdown={request.body ?? ""}
            editable={!locked}
            onDraftChange={setDescription}
            placeholder={m.tickets_create_dialog_description_placeholder()}
          />
        </MentionScopeProvider>
      </Composer.Body>
      <Composer.Error>
        {Submission.$match(submission, {
          editing: ({ failure }) => failure,
          creating: () => null,
          linking: () => null,
          linkFailed: ({ ticket, failure }) =>
            m.tickets_create_link_failed({ id: ticket.id, error: failure })
        })}
      </Composer.Error>
      <Composer.Tray>
        {slug === null ? null : (
          <Composer.Fields>
            <ProjectScope orgSlug={orgSlug} slug={slug}>
              <fieldset disabled={locked} className="contents">
                <TicketFieldChips
                  key={slug}
                  orgSlug={orgSlug}
                  slug={slug}
                  creatorType={creatorType}
                  typeLocked={makingEpic}
                  value={fields}
                  onChange={(patch) =>
                    setFields((current) => ({ ...current, ...patch }))
                  }
                />
                {!isEpicType(creatorType.type) && (
                  <SprintSelect value={sprint} onChange={setSprint} />
                )}
              </fieldset>
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
              {linkFailed
                ? m.tickets_create_retry_link()
                : makingEpic
                  ? m.tickets_create_epic_submit()
                  : m.tickets_create_dialog_submit()}
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
