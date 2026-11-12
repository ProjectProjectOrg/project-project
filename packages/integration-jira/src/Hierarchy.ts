import { canHoldChildren, canHaveParent, type TypeKey } from "@pp/shared"

import type { JiraMappingSource, JiraMigrationMappings } from "./Mappings"

export type JiraParentDropReason =
  | "epic-cannot-have-parent"
  | "parent-not-scanned"
  | "parent-excluded"
  | "too-deeply-nested"
  | "parent-cycle"

export type JiraParentDrop = Readonly<{
  issueId: string
  parentIssueId: string
  parentIssueKey: string | null
  reason: JiraParentDropReason
}>

export type JiraHierarchy = Readonly<{
  parents: ReadonlyMap<string, string>
  dropped: ReadonlyArray<JiraParentDrop>
}>

export type JiraHierarchySource = Readonly<{
  issues: ReadonlyArray<
    Readonly<{
      id: string
      key?: string
      issueTypeId: string
      parentIssueId: string | null
      parentIssueKey?: string | null | undefined
    }>
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
  const scanned = new Map(source.issues.map((issue) => [issue.id, issue]))
  const issues = new Map(
    source.issues
      .filter(({ id }) => !excluded.has(id))
      .map((issue) => [issue.id, issue])
  )
  const typeOf = (issueId: string): TypeKey | null => {
    const issue = issues.get(issueId)
    return (issue && types.get(issue.issueTypeId)) ?? null
  }

  const resolved = new Map<string, string | null>()
  const dropped: Array<JiraParentDrop> = []
  const resolving = new Set<string>()

  const parentOf = (issueId: string): string | null => {
    const known = resolved.get(issueId)
    if (known !== undefined) return known
    const issue = issues.get(issueId)
    const parentIssueId = issue?.parentIssueId ?? null
    if (parentIssueId === null) {
      resolved.set(issueId, null)
      return null
    }
    const drop = (reason: JiraParentDropReason) => {
      dropped.push({
        issueId,
        parentIssueId,
        parentIssueKey:
          scanned.get(parentIssueId)?.key ?? issue?.parentIssueKey ?? null,
        reason
      })
      resolved.set(issueId, null)
      return null
    }
    if (!canHaveParent(typeOf(issueId))) return drop("epic-cannot-have-parent")
    if (excluded.has(parentIssueId)) return drop("parent-excluded")
    if (!issues.has(parentIssueId)) return drop("parent-not-scanned")
    if (parentIssueId === issueId || resolving.has(parentIssueId))
      return drop("parent-cycle")
    resolving.add(issueId)
    const grandparentId = parentOf(parentIssueId)
    resolving.delete(issueId)
    const settled = resolved.get(issueId)
    if (settled !== undefined) return settled
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
