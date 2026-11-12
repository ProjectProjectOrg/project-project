import type { ComponentType } from "react"

import { TicketBranchCommand } from "@/features/github/components/TicketBranchCommand"
import { TicketBranchPickCommand } from "@/features/github/components/TicketBranchPickCommand"
import { SwitchOrgCommands } from "@/features/organizations/components/SwitchOrgCommands"
import { EditorPreferenceCommands } from "@/features/profile/components/EditorPreferenceCommands"
import {
  CreateProjectPage,
  SwitchProjectPage
} from "@/features/projects/components/ProjectCommandPages"
import { SprintAddTicketsPage } from "@/features/sprints/components/SprintAddTicketsPage"
import {
  SprintCompletePage,
  SprintDeletePage,
  SprintLengthPage,
  SprintRenamePage,
  SprintSchedulePage,
  type SprintPageProps
} from "@/features/sprints/components/SprintCommandPages"
import { SprintPlanPage } from "@/features/sprints/components/SprintPlanPage"
import { TicketAssigneeCommands } from "@/features/tickets/components/command-pages/TicketAssigneeCommands"
import {
  TicketArchivePage,
  TicketDeletePage,
  TicketEstimatePage,
  TicketParentPage,
  TicketTagsPage,
  TicketTypePage,
  type TicketPageProps
} from "@/features/tickets/components/command-pages/TicketFieldCommands"
import { TicketMovePage } from "@/features/tickets/components/command-pages/TicketMoveCommands"
import { TicketPriorityCommands } from "@/features/tickets/components/command-pages/TicketPriorityCommands"
import {
  TicketCreateRelatedPage,
  TicketRemoveRelationPage
} from "@/features/tickets/components/command-pages/TicketRelationCommands"
import { TicketSprintCommands } from "@/features/tickets/components/command-pages/TicketSprintCommands"
import { TicketStatusCommands } from "@/features/tickets/components/command-pages/TicketStatusCommands"
import { TicketSubTicketPage } from "@/features/tickets/components/command-pages/TicketSubTicketPage"
import {
  viewFilterDimensionPage,
  ViewFilterPage
} from "@/features/tickets/components/command-pages/ViewFilterCommands"
import { MarkAsCommands } from "@/features/tickets/components/ticket-marks/MarkAsCommands"
import { MarkTicketCommand } from "@/features/tickets/components/ticket-marks/MarkTicketCommand"
import type { MarkPickKind } from "@/features/tickets/lib/relationGroups"

import { TicketSearchCommands } from "./components/RootCommands"
import { ThemeCommands } from "./components/ThemeCommands"
import type { CommandPage } from "./lib/commandMenu"
import type { CommandPageProps } from "./lib/commandPages"

function TicketStatusPage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketStatusCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

function TicketPriorityPage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketPriorityCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

function TicketAssigneePage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketAssigneeCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

function TicketSprintPage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketSprintCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

const ticketPage = (Page: ComponentType<TicketPageProps>) =>
  function TicketCommandPage(props: CommandPageProps) {
    return props.context.ticket === null ? null : (
      <Page {...props} ticket={props.context.ticket} />
    )
  }

const markPage = (kind: MarkPickKind) =>
  function MarkTicketPage({ context, chip, onBack, env }: CommandPageProps) {
    return context.ticket === null ? null : (
      <MarkTicketCommand
        ticket={context.ticket}
        kind={kind}
        chip={chip}
        onBack={onBack}
        onDone={env.close}
      />
    )
  }

const sprintPage = (Page: ComponentType<SprintPageProps>) =>
  function SprintCommandPage(props: CommandPageProps) {
    return props.context.sprint === null ? null : (
      <Page {...props} sprint={props.context.sprint} />
    )
  }

export const COMMAND_PAGES: Readonly<
  Record<Exclude<CommandPage, "root">, ComponentType<CommandPageProps>>
> = {
  ticketSearch: TicketSearchCommands,
  ticketStatus: TicketStatusPage,
  ticketPriority: TicketPriorityPage,
  ticketAssignee: TicketAssigneePage,
  ticketSprint: TicketSprintPage,
  ticketMove: ticketPage(TicketMovePage),
  ticketMarkAs: MarkAsCommands,
  ticketEstimate: ticketPage(TicketEstimatePage),
  ticketType: ticketPage(TicketTypePage),
  ticketTags: ticketPage(TicketTagsPage),
  ticketParent: ticketPage(TicketParentPage),
  ticketSubTicket: ticketPage(TicketSubTicketPage),
  ticketCreateRelated: ticketPage(TicketCreateRelatedPage),
  ticketRemoveRelation: ticketPage(TicketRemoveRelationPage),
  ticketArchive: ticketPage(TicketArchivePage),
  ticketDelete: ticketPage(TicketDeletePage),
  ticketBranch: ticketPage(TicketBranchCommand),
  ticketLinkBranch: ticketPage((props) => (
    <TicketBranchPickCommand {...props} mode="link" />
  )),
  ticketStackBranch: ticketPage((props) => (
    <TicketBranchPickCommand {...props} mode="stack" />
  )),
  switchOrg: SwitchOrgCommands,
  switchProject: SwitchProjectPage,
  createProject: CreateProjectPage,
  theme: ThemeCommands,
  editorPreference: EditorPreferenceCommands,
  viewFilter: ViewFilterPage,
  "filter:type": viewFilterDimensionPage("type"),
  "filter:assignee": viewFilterDimensionPage("assignee"),
  "filter:sprint": viewFilterDimensionPage("sprint"),
  "filter:estimate": viewFilterDimensionPage("estimate"),
  "filter:tags": viewFilterDimensionPage("tags"),
  sprintSchedule: sprintPage(SprintSchedulePage),
  sprintComplete: sprintPage(SprintCompletePage),
  sprintLength: sprintPage(SprintLengthPage),
  sprintRename: sprintPage(SprintRenamePage),
  sprintAddTickets: sprintPage(SprintAddTicketsPage),
  sprintDelete: sprintPage(SprintDeletePage),
  sprintPlan: sprintPage(SprintPlanPage),
  "mark:blockedBy": markPage("blockedBy"),
  "mark:blocking": markPage("blocking"),
  "mark:related": markPage("related"),
  "mark:duplicateOf": markPage("duplicateOf")
}
