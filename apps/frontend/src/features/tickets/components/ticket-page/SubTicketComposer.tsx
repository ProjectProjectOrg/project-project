import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { isEpic, type Ticket } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { Link2 } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { KbdShortcut } from "@pp/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
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
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTicketsRequest,
  createChildTicket
} from "@/features/tickets/atoms/childTickets"
import { TicketFieldChips } from "@/features/tickets/components/create-ticket/TicketFieldChips"
import { useCreatorFocus } from "@/features/tickets/components/ticket-list/useCreatorFocus"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import {
  DEFAULT_TICKET_FIELDS,
  ticketFieldsPayload,
  type TicketFields
} from "@/features/tickets/lib/ticketFields"
import { parentRef } from "@/features/tickets/lib/ticketPatch"
import { errorMessage } from "@/lib/errorMessage"
import { keyLabels } from "@/lib/keyLabels"
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
  const formRef = useRef<HTMLFormElement>(null)
  const { active } = useCreatorFocus(formRef, undefined, true)
  const description = useRef("")
  useEffect(() => titleInput.current?.focus(), [])
  const inEpic = isEpic(parent)
  const cancelLabel = m.common_cancel_button()
  const createLabel = inEpic
    ? m.tickets_create_dialog_submit()
    : m.tickets_children_create_sub_ticket()
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
      ref={formRef}
      data-ticket-composer={active || undefined}
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
          <Composer.Actions onKeyDown={onKeyDown}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-keyshortcuts="Escape"
                    onClick={onClose}
                  >
                    {cancelLabel}
                  </Button>
                }
              />
              <TooltipContent>
                <span className="flex items-center gap-2">
                  {cancelLabel}
                  <KbdShortcut
                    keys="Escape"
                    keyLabels={keyLabels()}
                    size="sm"
                    aria-hidden
                  />
                </span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                disabled={trimmed === ""}
                render={
                  <Button
                    type="submit"
                    size="sm"
                    aria-keyshortcuts="Meta+Enter Control+Enter"
                    disabled={trimmed === ""}
                  >
                    {createLabel}
                  </Button>
                }
              />
              <TooltipContent>
                <span className="flex items-center gap-2">
                  {createLabel}
                  <KbdShortcut
                    keys="Mod+Enter"
                    keyLabels={keyLabels()}
                    size="sm"
                    aria-hidden
                  />
                </span>
              </TooltipContent>
            </Tooltip>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}
