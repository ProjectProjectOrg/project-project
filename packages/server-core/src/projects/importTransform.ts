import {
  ATTACHMENT_URL_PREFIX,
  rewriteTicketMentions,
  parseCommentMentionId,
  formatCommentMentionId,
  type CommentOrigin,
  type ImportedAuthor,
  type TicketActivityChangeEncoded
} from "@pp/shared"
import * as Match from "effect/Match"
import * as Predicate from "effect/Predicate"

import {
  type CommentBlock,
  parseCommentsRegion,
  serializeCommentsRegion,
  splitDescriptionAndCommentsRegion
} from "../comments/comments-region"
import {
  markdownFileContent,
  parseMarkdownFile,
  ticketFileBody
} from "../markdown/fileContent"

export type ImportMapping = Readonly<{
  types: ReadonlyMap<string, string>
  fromSlug: string
  toSlug: string
  fromKey: string
  toKey: string
  orgSlug: string
  users: ReadonlyMap<string, string>
  people: ReadonlyMap<string, Readonly<{ name: string }>>
  attachments: ReadonlyMap<string, string>
  newCommentId: (sourceId: string) => string
}>

export type ImportedProjectIdentity = Readonly<{
  slug: string
  name: string
  formerKeys: ReadonlyArray<string>
}>

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const renameTicketId = (mapping: ImportMapping, id: string): string =>
  id.startsWith(`${mapping.fromKey}-`)
    ? `${mapping.toKey}${id.slice(mapping.fromKey.length)}`
    : id

export const importedAuthorOf = (
  mapping: ImportMapping,
  sourceUserId: string
): ImportedAuthor => ({
  kind: "imported",
  displayName: mapping.people.get(sourceUserId)?.name ?? sourceUserId,
  source: "projectproject",
  sourceId: sourceUserId
})

export const rewriteText = (mapping: ImportMapping, text: string): string => {
  const attachmentUrl = new RegExp(
    `${escapeRegExp(ATTACHMENT_URL_PREFIX)}/[a-z0-9-]+/([0-9A-HJKMNP-TV-Z]{26})`,
    "g"
  )
  return rewriteTicketMentions(text, (target) =>
    target.projectSlug !== null && target.projectSlug !== mapping.fromSlug
      ? null
      : {
          projectSlug: target.projectSlug === null ? null : mapping.toSlug,
          ticketId: renameTicketId(mapping, target.ticketId)
        }
  )
    .replace(/\(mention:comment\/([^)\s]+)\)/g, (whole, id: string) => {
      const target = parseCommentMentionId(id)
      return target === null ||
        (target.projectSlug !== null && target.projectSlug !== mapping.toSlug)
        ? whole
        : `(mention:comment/${formatCommentMentionId({ ...target, commentId: mapping.newCommentId(target.commentId) })})`
    })
    .replace(/\(mention:user\/([^)\s]+)\)/g, (whole, id: string) => {
      const target = mapping.users.get(id)
      return target === undefined ? whole : `(mention:user/${target})`
    })
    .replace(attachmentUrl, (whole, id: string) => {
      const target = mapping.attachments.get(id)
      return target === undefined
        ? whole
        : `${ATTACHMENT_URL_PREFIX}/${mapping.orgSlug}/${target}`
    })
}

const stringsIn = (value: ReadonlyArray<unknown>) =>
  value.filter(Predicate.isString)

const commentOf = (
  mapping: ImportMapping,
  comment: CommentBlock
): CommentBlock => {
  const id = mapping.newCommentId(comment.id)
  const body = rewriteText(mapping, comment.body)
  comment = {
    ...comment,
    ...(comment.replyTo === undefined
      ? {}
      : { replyTo: mapping.newCommentId(comment.replyTo) }),
    ...(comment.resolvedBy === undefined
      ? {}
      : {
          resolvedBy:
            mapping.users.get(comment.resolvedBy) ?? comment.resolvedBy
        }),
    ...(comment.tickets === undefined
      ? {}
      : { tickets: comment.tickets.map((link) => rewriteText(mapping, link)) })
  }
  if (comment.author.kind === "imported") return { ...comment, id, body }
  const linked = mapping.users.get(comment.author.userId)
  if (linked !== undefined)
    return { ...comment, id, body, author: { kind: "user", userId: linked } }
  const origin: CommentOrigin =
    comment.origin === "native" ? "projectproject" : comment.origin
  return {
    ...comment,
    id,
    body,
    origin,
    author: importedAuthorOf(mapping, comment.author.userId)
  }
}

const transformTicket = (mapping: ImportMapping, content: string) => {
  const { data, content: body } = parseMarkdownFile(content)
  const { description, region } = splitDescriptionAndCommentsRegion(body)
  const frontmatter: Record<string, unknown> = { ...data }
  for (const field of ["id", "parent", "splitFrom", "duplicateOf"]) {
    const value = data[field]
    if (Predicate.isString(value))
      frontmatter[field] = renameTicketId(mapping, value)
  }
  if (Predicate.isString(data.type))
    frontmatter.type = mapping.types.get(data.type) ?? data.type
  for (const field of ["blockedBy", "relatedTo"]) {
    if (Array.isArray(data[field]))
      frontmatter[field] = stringsIn(data[field]).map((id) =>
        renameTicketId(mapping, id)
      )
  }
  for (const field of ["createdBy", "updatedBy"]) {
    const value = data[field]
    if (Predicate.isString(value))
      frontmatter[field] = mapping.users.get(value) ?? value
  }
  if (Array.isArray(data.assignees))
    frontmatter.assignees = stringsIn(data.assignees).flatMap((id) => {
      const target = mapping.users.get(id)
      return target === undefined ? [] : [target]
    })
  const comments = parseCommentsRegion(region).map((comment) =>
    commentOf(mapping, comment)
  )
  return markdownFileContent(
    frontmatter,
    ticketFileBody(
      rewriteText(mapping, description),
      serializeCommentsRegion(comments)
    )
  )
}

const transformGroup = (mapping: ImportMapping, content: string) => {
  const { data, content: body } = parseMarkdownFile(content)
  const frontmatter: Record<string, unknown> = { ...data }
  if (Array.isArray(data.tickets))
    frontmatter.tickets = stringsIn(data.tickets).map((id) =>
      renameTicketId(mapping, id)
    )
  if (Array.isArray(data.snapshot)) {
    const snapshot: ReadonlyArray<unknown> = data.snapshot
    frontmatter.snapshot = snapshot.map((entry) =>
      Predicate.isObject(entry) && Predicate.isString(entry.id)
        ? { ...entry, id: renameTicketId(mapping, entry.id) }
        : entry
    )
  }
  return markdownFileContent(frontmatter, rewriteText(mapping, body))
}

const transformProject = (
  mapping: ImportMapping,
  identity: ImportedProjectIdentity,
  content: string
) => {
  const { data, content: body } = parseMarkdownFile(content)
  const frontmatter: Record<string, unknown> = {
    ...data,
    org: mapping.orgSlug,
    slug: identity.slug,
    name: identity.name,
    key: mapping.toKey
  }
  if (identity.formerKeys.length > 0)
    frontmatter.formerKeys = [...identity.formerKeys]
  if (Predicate.isString(data.createdBy))
    frontmatter.createdBy = mapping.users.get(data.createdBy) ?? data.createdBy
  return markdownFileContent(frontmatter, rewriteText(mapping, body))
}

const TICKET_PATH = /^tickets\/([A-Za-z0-9_-]+)\.md$/

export type ImportedFile = Readonly<{ path: string; content: string }>

export const transformImportedFile = (
  mapping: ImportMapping,
  identity: ImportedProjectIdentity,
  file: ImportedFile
): ImportedFile => {
  if (file.path === "project.md")
    return {
      path: file.path,
      content: transformProject(mapping, identity, file.content)
    }
  const ticket = TICKET_PATH.exec(file.path)
  if (ticket)
    return {
      path: `tickets/${renameTicketId(mapping, ticket[1])}.md`,
      content: transformTicket(mapping, file.content)
    }
  if (file.path.startsWith("groups/") && file.path.endsWith(".md"))
    return { path: file.path, content: transformGroup(mapping, file.content) }
  return file.path.endsWith(".md")
    ? { path: file.path, content: rewriteText(mapping, file.content) }
    : file
}

export const rewriteImportedChange = (
  mapping: ImportMapping,
  change: TicketActivityChangeEncoded
): TicketActivityChangeEncoded =>
  Match.value(change).pipe(
    Match.discriminator("kind")("assignees_changed", (change) => ({
      ...change,
      added: change.added.map((id) => mapping.users.get(id) ?? id),
      removed: change.removed.map((id) => mapping.users.get(id) ?? id)
    })),
    Match.discriminator("kind")("split", (change) => ({
      ...change,
      into: change.into.map((id) => renameTicketId(mapping, id))
    })),
    Match.discriminator("kind")(
      "relation_added",
      "relation_removed",
      (change) => ({
        ...change,
        ticket: renameTicketId(mapping, change.ticket)
      })
    ),
    Match.discriminator("kind")("type_changed", (change) => ({
      ...change,
      from:
        change.from === null
          ? null
          : (mapping.types.get(change.from) ?? change.from),
      to:
        change.to === null ? null : (mapping.types.get(change.to) ?? change.to)
    })),
    Match.orElse((change) => change)
  )
