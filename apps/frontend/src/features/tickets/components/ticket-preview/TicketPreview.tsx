import { RegistryContext } from "@effect/atom-react"
import { type TicketId } from "@pp/shared"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"
import { useContext, type ComponentProps } from "react"

import {
  ProjectContext,
  useProjectRequest,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  PullRequestPreview,
  StackPreview
} from "@/features/sprints/components/GitPreview"
import { tagsRequest, tagUsage } from "@/features/tags/atoms/tags"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketPreviewBody } from "@/features/tickets/components/TicketHoverCard"
import { TicketPreview } from "@/features/tickets/lib/ticketPreview"

import { FlagPreview } from "./FlagPreview"
import { TagListPreview, TagPreview } from "./TagPreviews"
import { RelationsPreview, SubTicketsPreview } from "./TicketListPreviews"

// A chip or link that previews on hover (and on focus). Chips whose preview
// holds more than they say (lists, a flag's reason) also open on click, for
// the keyboard and touch.
export function TicketPreviewTrigger({
  preview,
  onClick,
  ...props
}: Readonly<{ preview: TicketPreview }> &
  Omit<ComponentProps<typeof HoverCardTrigger>, "openOnClick">) {
  const project = useProjectRequest()
  const warm = useWarmPreview()
  const opensOnClick = OPENS_ON_CLICK[preview._tag]
  return (
    <HoverCard>
      <HoverCardTrigger
        openOnClick={opensOnClick}
        aria-haspopup={opensOnClick ? "dialog" : undefined}
        onPointerEnter={() => warm(preview)}
        onClick={(event) => {
          if (opensOnClick) {
            event.stopPropagation()
            warm(preview)
          }
          onClick?.(event)
        }}
        {...props}
      />
      {/* oxlint-disable-next-line shadcn/require-static-classes -- one static width per preview kind, in PREVIEW_WIDTHS below */}
      <HoverCardContent className={PREVIEW_WIDTHS[preview._tag]}>
        <ProjectContext value={project}>
          <PreviewContent preview={preview} />
        </ProjectContext>
      </HoverCardContent>
    </HoverCard>
  )
}

function useWarmPreview() {
  const registry = useContext(RegistryContext)
  const { orgSlug, slug } = useProjectRoute()
  const detail = ({ id }: Readonly<{ id: TicketId }>) =>
    Registry.getResult(registry, ticketDetail(ticketRequest(orgSlug, slug, id)))
  return (preview: TicketPreview) => {
    const loaded = TicketPreview.$match(preview, {
      ticket: detail,
      relations: detail,
      subTickets: ({ id }) =>
        Registry.getResult(
          registry,
          childTickets(childTicketsRequest(orgSlug, slug, id))
        ),
      flag: () => null,
      tag: () =>
        Registry.getResult(registry, tagUsage(tagsRequest(orgSlug, slug))),
      tags: () => null,
      pullRequest: () => null,
      stack: () => null
    })
    if (loaded === null) return
    void Effect.runPromise(Effect.ignore(loaded))
  }
}

const PREVIEW_WIDTHS: Readonly<Record<TicketPreview["_tag"], string>> = {
  ticket: "w-80 p-3",
  // Ticket lists are menu rows, so the popup pads like a menu's.
  relations: "w-72 p-1",
  subTickets: "w-72 p-1",
  flag: "w-72 p-1.5",
  tag: "flex w-64 flex-col gap-2 p-3",
  tags: "w-56 p-1.5",
  // Git cards only show; their chips' clicks follow the link.
  pullRequest: "pointer-events-none flex w-80 flex-col gap-2 p-3",
  stack: "pointer-events-none flex w-80 flex-col gap-2 p-3"
}

// Cards that hold more than their chip says open on click too, for the
// keyboard and touch. A ticket's and git's chips are links of their own.
const OPENS_ON_CLICK: Readonly<Record<TicketPreview["_tag"], boolean>> = {
  ticket: false,
  relations: true,
  subTickets: true,
  flag: true,
  tag: true,
  tags: true,
  pullRequest: false,
  stack: false
}

function PreviewContent({ preview }: Readonly<{ preview: TicketPreview }>) {
  const { orgSlug, slug } = useProjectRoute()
  return TicketPreview.$match(preview, {
    ticket: ({ id, shortcut }) => (
      <TicketPreviewBody
        ticketId={id}
        scope={{ orgSlug, slug }}
        interactive
        shortcut={shortcut}
      />
    ),
    relations: ({ id, relation }) => (
      <RelationsPreview id={id} relation={relation} />
    ),
    subTickets: ({ id, label, current, search }) => (
      <SubTicketsPreview
        id={id}
        label={label}
        current={current}
        search={search}
      />
    ),
    flag: ({ flag }) => <FlagPreview flag={flag} />,
    tag: ({ name }) => <TagPreview name={name} />,
    tags: ({ names }) => <TagListPreview names={names} />,
    pullRequest: (props) => <PullRequestPreview {...props} />,
    stack: (props) => <StackPreview {...props} />
  })
}
