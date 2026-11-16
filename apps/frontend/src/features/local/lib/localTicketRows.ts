import {
  type GitRepository,
  pendingGitState,
  StatusFact,
  Ticket,
  TicketFact,
  TicketFlag
} from "@pp/shared"
import * as Schema from "effect/Schema"

const encodeFlag = Schema.encodeSync(TicketFlag)

const decodeFact = Schema.decodeUnknownSync(Schema.fromJsonString(TicketFact))
export const decodeStatus = Schema.decodeUnknownSync(
  Schema.fromJsonString(StatusFact)
)
const decodeTicket = Schema.decodeUnknownSync(Ticket)

export const finishedStatuses = (statuses: ReadonlyArray<StatusFact>) => {
  const done = statuses.find((status) => status.slug === "done")
  return statuses.flatMap((status) =>
    status.slug === "done" ||
    (done !== undefined &&
      status.slug !== "todo" &&
      status.slug !== "in_progress" &&
      status.orderKey > done.orderKey)
      ? [status.slug]
      : []
  )
}

export type SectionRow = Readonly<{
  data: string
  orderKey: string
  parentTitle: string | null
  parentType: string | null
  subTicketCount: number
  subTicketDoneCount: number
  openBlockerCount: number
  openBlockingCount: number
  relatedCount: number
  duplicateCount: number
}>

export const toTicket = (
  row: SectionRow,
  repository: (repoId: string | null) => GitRepository | null
): Ticket => {
  const fact = decodeFact(row.data)
  const git = fact.git
  return decodeTicket({
    id: fact.id,
    title: fact.title,
    status: fact.status,
    type: fact.type,
    priority: fact.priority,
    rank: fact.rank,
    estimate: fact.estimate,
    flag: fact.flag === null ? null : encodeFlag(fact.flag),
    tags: fact.tags,
    repoId: git?.repoId ?? null,
    branch: git?.branch ?? null,
    pr: git?.pr ?? null,
    prState: git?.prState ?? null,
    lastTransitionedPr: git?.lastTransitionedPr ?? null,
    gitState:
      git === null
        ? { tag: "no_branch" }
        : pendingGitState(git, repository(git.repoId), git.branchDeletedAt),
    assignees: fact.assignees,
    parent:
      fact.parent === null || row.parentTitle === null
        ? null
        : { id: fact.parent, title: row.parentTitle, type: row.parentType },
    subTicketCount: row.subTicketCount,
    subTicketDoneCount: row.subTicketDoneCount,
    openBlockerCount: row.openBlockerCount,
    openBlockingCount: row.openBlockingCount,
    relatedCount: row.relatedCount,
    duplicateCount: row.duplicateCount,
    archivedAt: fact.archivedAt?.toISOString() ?? null,
    createdBy: fact.createdBy,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString()
  })
}
