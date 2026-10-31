import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  organization,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink,
  ticketBranch,
  ticketIndex
} from "@pp/db/schema"
import type { ChecksStatus, TicketBranchEntry } from "@pp/shared"
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL
} from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { TicketIndexMatch, TicketIndexProject } from "./TicketIndex"

const stackEntryFromRow = (
  row: typeof ticketBranch.$inferSelect
): TicketBranchEntry =>
  Object.assign(
    { branch: row.branch },
    row.base === null ? {} : { base: row.base },
    row.pr === null ? {} : { pr: row.pr },
    row.prState === null ? {} : { prState: row.prState },
    row.prDraft ? { prDraft: true } : {},
    row.landed ? { landed: true } : {}
  )

export class TicketBranchIndex extends Context.Service<
  TicketBranchIndex,
  Readonly<{
    findTicketsByBranch: (
      projectId: string,
      branch: string
    ) => Effect.Effect<ReadonlyArray<TicketIndexMatch>>
    findStackLayers: (
      projectId: string,
      branch: string
    ) => Effect.Effect<ReadonlyArray<TicketIndexMatch>>
    stacksFor: (
      project: TicketIndexProject,
      ticketIds?: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyMap<string, ReadonlyArray<TicketBranchEntry>>>
    findMergesAwaiting: (
      projectId: string,
      base: string
    ) => Effect.Effect<
      ReadonlyArray<TicketIndexMatch & Readonly<{ stacked: boolean }>>
    >
    isRepositoryBranchAttached: (
      repoId: string,
      branch: string,
      stackedOnly?: boolean
    ) => Effect.Effect<boolean>
    getBranchDeletedAt: (
      orgSlug: string,
      slug: string,
      ticketId: string
    ) => Effect.Effect<Date | null>
    markBranchStale: (
      projectId: string,
      branch: string,
      deletedAt: Date
    ) => Effect.Effect<ReadonlyArray<string>>
    clearBranchStale: (
      project: TicketIndexProject,
      ticketIds: ReadonlyArray<string>
    ) => Effect.Effect<void>
    updateBranchChecks: (
      projectId: string,
      branch: string,
      checks: ChecksStatus,
      headSha: string,
      updatedAt: Date
    ) => Effect.Effect<ReadonlyArray<string>>
  }>
>()("@pp/server-core/tickets/TicketBranchIndex") {}

const make = Effect.gen(function* () {
  const db = yield* Db

  const findTicketsByBranch = (
    projectId: string,
    branch: string
  ): Effect.Effect<
    ReadonlyArray<{
      readonly orgSlug: string
      readonly organizationId: string
      readonly projectId: string
      readonly projectSlug: string
      readonly ticketId: string
      readonly branch: string
    }>
  > =>
    db
      .select({
        orgSlug: organization.slug,
        organizationId: ticketIndex.organizationId,
        projectId: ticketIndex.projectId,
        projectSlug: projectIndex.slug,
        ticketId: ticketIndex.ticketId,
        branch: ticketIndex.branch
      })
      .from(ticketIndex)
      .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
      .innerJoin(organization, eq(organization.id, ticketIndex.organizationId))
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          eq(ticketIndex.branch, branch)
        )
      )
      .pipe(
        Effect.map((rows) =>
          rows.flatMap((row) =>
            row.branch === null ? [] : [{ ...row, branch: row.branch }]
          )
        ),
        Effect.orDie
      )

  const stackLayerMatches = (where: SQL | undefined) =>
    db
      .select({
        orgSlug: organization.slug,
        organizationId: projectIndex.organizationId,
        projectId: ticketBranch.projectId,
        projectSlug: projectIndex.slug,
        ticketId: ticketBranch.ticketId,
        branch: ticketBranch.branch
      })
      .from(ticketBranch)
      .innerJoin(projectIndex, eq(projectIndex.id, ticketBranch.projectId))
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(where)

  const findStackLayers = (
    projectId: string,
    branch: string
  ): Effect.Effect<ReadonlyArray<TicketIndexMatch>> =>
    stackLayerMatches(
      and(
        eq(ticketBranch.projectId, projectId),
        eq(ticketBranch.branch, branch)
      )
    ).pipe(Effect.orDie)

  const stacksFor = (
    project: TicketIndexProject,
    ticketIds?: ReadonlyArray<string>
  ): Effect.Effect<ReadonlyMap<string, ReadonlyArray<TicketBranchEntry>>> =>
    ticketIds !== undefined && ticketIds.length === 0
      ? Effect.succeed(new Map())
      : db
          .select()
          .from(ticketBranch)
          .where(
            and(
              eq(ticketBranch.projectId, project.projectId),
              ticketIds === undefined
                ? undefined
                : inArray(ticketBranch.ticketId, [...ticketIds])
            )
          )
          .orderBy(asc(ticketBranch.ticketId), asc(ticketBranch.position))
          .pipe(
            Effect.map((rows) => {
              const stacks = new Map<string, Array<TicketBranchEntry>>()
              for (const row of rows) {
                const stack = stacks.get(row.ticketId) ?? []
                stack.push(stackEntryFromRow(row))
                stacks.set(row.ticketId, stack)
              }
              return stacks
            }),
            Effect.orDie
          )

  const findMergesAwaiting = (
    projectId: string,
    base: string
  ): Effect.Effect<
    ReadonlyArray<TicketIndexMatch & Readonly<{ stacked: boolean }>>
  > =>
    Effect.all([
      db
        .select({
          orgSlug: organization.slug,
          organizationId: projectIndex.organizationId,
          projectId: ticketIndex.projectId,
          projectSlug: projectIndex.slug,
          ticketId: ticketIndex.ticketId,
          branch: ticketIndex.branch
        })
        .from(ticketIndex)
        .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .where(
          and(
            eq(ticketIndex.projectId, projectId),
            eq(ticketIndex.prBase, base),
            eq(ticketIndex.prState, "merged"),
            isNotNull(ticketIndex.pr),
            or(
              isNull(ticketIndex.lastTransitionedPr),
              ne(ticketIndex.lastTransitionedPr, ticketIndex.pr)
            )
          )
        ),
      stackLayerMatches(
        and(
          eq(ticketBranch.projectId, projectId),
          eq(ticketBranch.base, base),
          eq(ticketBranch.prState, "merged"),
          eq(ticketBranch.landed, false)
        )
      )
    ]).pipe(
      Effect.map(([own, stacked]) => [
        ...own.flatMap((row) =>
          row.branch === null
            ? []
            : [{ ...row, branch: row.branch, stacked: false }]
        ),
        ...stacked.map((row) => ({ ...row, stacked: true }))
      ]),
      Effect.orDie
    )

  const isRepositoryBranchAttached = (
    repoId: string,
    branch: string,
    stackedOnly = false
  ) =>
    db
      .select({ ticketId: ticketIndex.ticketId })
      .from(ticketIndex)
      .innerJoin(
        projectIntegrationLink,
        eq(projectIntegrationLink.projectId, ticketIndex.projectId)
      )
      .innerJoin(
        projectGithubRepository,
        eq(
          projectGithubRepository.projectIntegrationLinkId,
          projectIntegrationLink.id
        )
      )
      .where(
        and(
          eq(projectGithubRepository.repoId, repoId),
          eq(projectIntegrationLink.provider, "github"),
          inArray(projectIntegrationLink.status, ["active", "broken"]),
          inArray(projectGithubRepository.status, ["active", "broken"]),
          or(
            stackedOnly ? undefined : eq(ticketIndex.branch, branch),
            exists(
              db
                .select({ branch: ticketBranch.branch })
                .from(ticketBranch)
                .where(
                  and(
                    eq(ticketBranch.projectId, ticketIndex.projectId),
                    eq(ticketBranch.ticketId, ticketIndex.ticketId),
                    eq(ticketBranch.branch, branch)
                  )
                )
            )
          )
        )
      )
      .limit(1)
      .pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.orDie
      )

  const getBranchDeletedAt = (
    orgSlug: string,
    slug: string,
    id: string
  ): Effect.Effect<Date | null> =>
    db
      .select({ branchDeletedAt: ticketIndex.branchDeletedAt })
      .from(ticketIndex)
      .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(
        and(
          eq(organization.slug, orgSlug),
          eq(projectIndex.slug, slug),
          publishedProject(),
          eq(ticketIndex.ticketId, id)
        )
      )
      .limit(1)
      .pipe(
        Effect.map((rows) => rows[0]?.branchDeletedAt ?? null),
        Effect.orDie
      )

  const markBranchStale = (
    projectId: string,
    branch: string,
    deletedAt: Date
  ): Effect.Effect<ReadonlyArray<string>> =>
    db
      .update(ticketIndex)
      .set({ branchDeletedAt: deletedAt })
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          eq(ticketIndex.branch, branch),
          isNull(ticketIndex.branchDeletedAt)
        )
      )
      .returning({ ticketId: ticketIndex.ticketId })
      .pipe(
        Effect.map((rows) => rows.map((row) => row.ticketId)),
        Effect.orDie
      )

  const clearBranchStale = (
    project: TicketIndexProject,
    ticketIds: ReadonlyArray<string>
  ): Effect.Effect<void> => {
    if (ticketIds.length === 0) return Effect.void
    return db
      .update(ticketIndex)
      .set({ branchDeletedAt: null })
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          inArray(ticketIndex.ticketId, [...ticketIds])
        )
      )
      .pipe(Effect.asVoid, Effect.orDie)
  }

  const updateBranchChecks = (
    projectId: string,
    branch: string,
    checks: ChecksStatus,
    headSha: string,
    updatedAt: Date
  ): Effect.Effect<ReadonlyArray<string>> =>
    db
      .update(ticketIndex)
      .set({ checks, checksHeadSha: headSha, checksUpdatedAt: updatedAt })
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          eq(ticketIndex.branch, branch),
          or(
            isNull(ticketIndex.checksUpdatedAt),
            lt(ticketIndex.checksUpdatedAt, updatedAt)
          )
        )
      )
      .returning({ ticketId: ticketIndex.ticketId })
      .pipe(
        Effect.map((rows) => rows.map((row) => row.ticketId)),
        Effect.orDie
      )

  return {
    findTicketsByBranch,
    findStackLayers,
    stacksFor,
    findMergesAwaiting,
    isRepositoryBranchAttached,
    getBranchDeletedAt,
    markBranchStale,
    clearBranchStale,
    updateBranchChecks
  }
})

export const layer = Layer.effect(TicketBranchIndex, make)
