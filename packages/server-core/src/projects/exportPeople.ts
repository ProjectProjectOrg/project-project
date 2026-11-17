import { extractMentionLinks } from "@pp/shared"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { parseMarkdownFile } from "../markdown/fileContent"

const PeopleFrontmatter = Schema.Struct({
  createdBy: Schema.optional(Schema.NonEmptyString),
  updatedBy: Schema.optional(Schema.NonEmptyString),
  assignees: Schema.optional(Schema.Array(Schema.NonEmptyString))
})

const decodePeopleFrontmatter = Schema.decodeUnknownOption(PeopleFrontmatter)

const frontmatterUserIds = (content: string) =>
  Option.match(decodePeopleFrontmatter(parseMarkdownFile(content).data), {
    onNone: () => [],
    onSome: ({ createdBy, updatedBy, assignees = [] }) => [
      ...(createdBy === undefined ? [] : [createdBy]),
      ...(updatedBy === undefined ? [] : [updatedBy]),
      ...assignees
    ]
  })

export const markdownUserIds = (content: string): ReadonlyArray<string> => [
  ...frontmatterUserIds(content),
  ...extractMentionLinks(content).flatMap((link) =>
    link.parsed?.type === "user" ? [link.parsed.id] : []
  )
]
