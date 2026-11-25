import type {
  GitState,
  StackLayerState,
  TicketFlag,
  TagName,
  TicketId
} from "@pp/shared"
import { flattenTicketBlocks } from "@pp/shared"
import type { HotkeyChord } from "@tanstack/react-hotkeys"
import * as Data from "effect/Data"

import type { PullRequest } from "@/features/sprints/components/gitLooks"

import type { RelationPreviewKind } from "./relationGroups"
import type { TicketDetailSearch } from "./ticketSearch"
export const previewOverflows = (body: string) => {
  const text = flattenTicketBlocks(body)
  return text.split("\n").length > 6 || text.length > 320
}

export type TicketPreview = Data.TaggedEnum<{
  ticket: Readonly<{ id: TicketId; shortcut?: HotkeyChord }>
  relations: Readonly<{ id: TicketId; relation: RelationPreviewKind }>
  subTickets: Readonly<{
    id: TicketId
    label: string
    current?: TicketId
    search?: TicketDetailSearch
  }>
  flag: Readonly<{ id: TicketId; flag: TicketFlag }>
  tag: Readonly<{ name: TagName }>
  tags: Readonly<{ names: ReadonlyArray<TagName> }>
  pullRequest: Readonly<{
    pr: PullRequest
    ticketId: TicketId
    repo: string | null
  }>
  stack: Readonly<{
    own: GitState
    stack: ReadonlyArray<StackLayerState>
    layers: ReadonlyArray<StackLayerState>
    repo: string | null
  }>
}>
export const TicketPreview = Data.taggedEnum<TicketPreview>()
