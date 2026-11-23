import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { isEpic, type Ticket } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { Link2 } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTicketsRequest,
  createChildTicket
} from "@/features/tickets/atoms/childTickets"
import {
  DEFAULT_TICKET_FIELDS,
  TicketFieldChips,
  ticketFieldsPayload,
  type TicketFields
} from "@/features/tickets/components/create-ticket/TicketFieldChips"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import { parentRef } from "@/features/tickets/lib/ticketPatch"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import { useAttachExistingTicket } from "./AddChildTicketButton"

type Parent = Pick<Ticket, "id" | "title" | "type">

export function SubTicketComposer({
  parent,
  onClose
}: Readonly<{ parent: Parent; onClose: () => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const create = useAtomSet(
    createChildTicket(childTicketsRequest(orgSlug, slug, parent.id)),
    { mode: "promiseExit" }
  )
  const viewerId = useAtomValue(currentUserId)
  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const [title, setTitle] = useState("")
  const [editor, setEditor] = useState({ version: 0, markdown: "" })
  const [fields, setFields] = useState<TicketFields>(DEFAULT_TICKET_FIELDS)
  const [failure, setFailure] = useState<string | null>(null)
  const creatorType = useCreatorType({ orgSlug, slug, epics: false })
  const titleInput = useRef<HTMLInputElement>(null)
  const description = useRef("")
  useEffect(() => titleInput.current?.focus(), [])
  const inEpic = isEpic(parent)
  const attachExisting = useAttachExistingTicket(parent)
  const trimmed = title.trim()

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (trimmed === "" || !Result.isSuccess(project)) return
    const body = description.current.trim()
    setFailure(null)
    setTitle("")
    description.current = ""
    setEditor(({ version }) => ({ version: version + 1, markdown: "" }))
    titleInput.current?.focus()
    const exit = await create({
      payload: {
        title: trimmed,
        ...ticketFieldsPayload(fields),
        ...creatorType.payload,
        body: body === "" ? undefined : body
      },
      parent: parentRef(parent),
      prediction: {
        clientId: Effect.runSync(Random.next).toString(36),
        createdBy: viewerId ?? "",
        projectPrefix: project.value.key,
        estimation: project.value.estimation,
        ...creatorType.prediction
      }
    })
    creatorType.settle(exit)
    if (Exit.isFailure(exit)) {
      setTitle((current) => (current === "" ? trimmed : current))
      if (body !== "" && description.current === "") {
        description.current = body
        setEditor(({ version }) => ({ version: version + 1, markdown: body }))
      }
      setFailure(errorMessage(Cause.squash(exit.cause)))
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault()
      onClose()
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col overflow-hidden rounded-xl border border-border/60 surface-background [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px] [corner-shape:var(--button-corner)]"
    >
      <Composer.Title>
        <Input
          ref={titleInput}
          variant="bare"
          aria-label={m.tickets_create_title_aria_label()}
          placeholder={
            inEpic
              ? m.tickets_create_dialog_title_placeholder()
              : m.tickets_children_sub_ticket_placeholder()
          }
          value={title}
          maxLength={200}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setTitle(event.target.value)
            setFailure(null)
          }}
        />
      </Composer.Title>
      <Composer.Body
        onKeyDownCapture={onKeyDown}
        className="[&_.lexical-content]:min-h-10"
      >
        <MentionScopeProvider scope={{ orgSlug, slug }}>
          <LexicalEditor
            key={editor.version}
            markdown={editor.markdown}
            onDraftChange={(markdown) => {
              description.current = markdown
            }}
            placeholder={m.tickets_create_dialog_description_placeholder()}
            compact
          />
        </MentionScopeProvider>
      </Composer.Body>
      <Composer.Error>{failure}</Composer.Error>
      <Composer.Tray>
        <Composer.Fields>
          <TicketFieldChips
            orgSlug={orgSlug}
            slug={slug}
            creatorType={creatorType}
            value={fields}
            onChange={(patch) =>
              setFields((current) => ({ ...current, ...patch }))
            }
          />
        </Composer.Fields>
        <Composer.Footer>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leadingIcon={Link2}
            onClick={attachExisting}
          >
            {m.tickets_children_attach_button()}
          </Button>
          <Composer.Actions>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {m.common_cancel_button()}
            </Button>
            <Button type="submit" size="sm" disabled={trimmed === ""}>
              {inEpic
                ? m.tickets_create_dialog_submit()
                : m.tickets_children_create_sub_ticket()}
            </Button>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}
