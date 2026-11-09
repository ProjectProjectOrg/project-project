import { canHoldChildren, type TicketType } from "@pp/shared"

import type { JiraMappingSource, JiraMigrationMappings } from "./Mappings"

export type JiraParentDropReason =
  | "epic-cannot-have-parent"
  | "parent-not-imported"
  | "too-deeply-nested"

export type JiraParentDrop = Readonly<{
  issueId: string
  parentIssueId: string
  reason: JiraParentDropReason
}>

export type JiraHierarchy = Readonly<{
  parents: ReadonlyMap<string, string>
  dropped: ReadonlyArray<JiraParentDrop>
}>

export type JiraHierarchySource = Readonly<{
  issues: ReadonlyArray<
    Readonly<{ id: string; issueTypeId: string; parentIssueId: string | null }>
  >
  restrictions: ReadonlyArray<
    Pick<
      JiraMappingSource["restrictions"][number],
      "id" | "targetKind" | "targetId"
    >
  >
}>

export function resolveJiraHierarchy(
  source: JiraHierarchySource,
  mappings: Pick<JiraMigrationMappings, "issueTypes" | "restrictions">
): JiraHierarchy {
  const excludedRestrictions = new Set(
    mappings.restrictions
      .filter(({ resolution }) => resolution === "exclude")
      .map(({ restrictionId }) => restrictionId)
  )
  const excluded = new Set(
    source.restrictions
      .filter(
        (restriction) =>
          restriction.targetKind === "issue" &&
          excludedRestrictions.has(restriction.id)
      )
      .map(({ targetId }) => targetId)
  )
  const types = new Map(
    mappings.issueTypes.map((mapping) => [
      mapping.sourceIssueTypeId,
      mapping.destinationType
    ])
  )
  const issues = new Map(
    source.issues
      .filter(({ id }) => !excluded.has(id))
      .map((issue) => [issue.id, issue])
  )
  const typeOf = (issueId: string): TicketType => {
    const issue = issues.get(issueId)
    return (issue && types.get(issue.issueTypeId)) ?? "other"
  }

  const resolved = new Map<string, string | null>()
  const dropped: Array<JiraParentDrop> = []
  const resolving = new Set<string>()

  const parentOf = (issueId: string): string | null => {
    const known = resolved.get(issueId)
    if (known !== undefined) return known
    const parentIssueId = issues.get(issueId)?.parentIssueId ?? null
    if (parentIssueId === null) {
      resolved.set(issueId, null)
      return null
    }
    const drop = (reason: JiraParentDropReason) => {
      dropped.push({ issueId, parentIssueId, reason })
      resolved.set(issueId, null)
      return null
    }
    if (typeOf(issueId) === "epic") return drop("epic-cannot-have-parent")
    if (!issues.has(parentIssueId) || resolving.has(issueId))
      return drop("parent-not-imported")
    resolving.add(issueId)
    const grandparentId = parentOf(parentIssueId)
    resolving.delete(issueId)
    if (
      !canHoldChildren(
        { type: typeOf(parentIssueId) },
        grandparentId === null ? null : { type: typeOf(grandparentId) }
      )
    )
      return drop("too-deeply-nested")
    resolved.set(issueId, parentIssueId)
    return parentIssueId
  }

  for (const issueId of issues.keys()) parentOf(issueId)
  return {
    parents: new Map(
      [...resolved].flatMap(([issueId, parentIssueId]) =>
        parentIssueId === null ? [] : [[issueId, parentIssueId] as const]
      )
    ),
    dropped: dropped.toSorted(
      (left, right) =>
        left.issueId.localeCompare(right.issueId, "en") ||
        left.parentIssueId.localeCompare(right.parentIssueId, "en")
    )
  }
}
