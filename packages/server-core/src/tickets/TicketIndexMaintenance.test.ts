import { it } from "@effect/vitest"
import { TagName, TicketId, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import type * as TicketDocs from "./TicketDocs"
import {
  commentIndexRowsFor,
  detectTicketIndexDrift,
  makeTicketIndexReconciler,
  ticketIndexRowsFor,
  ticketIndexHasDrift,
  type TicketIndexReconcilerDeps
} from "./TicketIndexMaintenance"
import type { TicketProject } from "./ticketProject"

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const tagName = Schema.decodeUnknownSync(TagName)
const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const project: TicketProject = {
  orgSlug: "acme",
  organizationId: "org-1",
  projectId: "project-1",
  slug: "demo"
}

const doc = (
  id: string,
  updatedAt: string,
  overrides: Partial<TicketDocs.TicketDocument> = {}
): TicketDocs.TicketDocument => ({
  id: ticketId(id),
  title: `Ticket ${id}`,
  status: ticketStatus("todo"),
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: at("2026-05-01T00:00:00.000Z"),
  updatedBy: "user-1",
  updatedAt: at(updatedAt),
  body: "",
  commentsRegion: "",
  ...overrides
})

describe("ticketIndexRowsFor", () => {
  it.effect(
    "normalizes every ticket document into its database insert row",
    () =>
      Effect.sync(() => {
        const tags = [tagName("backend"), tagName("urgent")]
        const assignees = ["user-2", "user-3"]
        const createdAt = at("2026-05-01T01:02:03.000Z")
        const updatedAt = at("2026-05-02T04:05:06.000Z")
        const archivedAt = at("2026-05-03T07:08:09.000Z")
        const document = doc("T-27", updatedAt.toISOString(), {
          title: "Ship pure index builders",
          status: ticketStatus("in_progress"),
          type: "chore",
          priority: "high",
          estimate: { unit: "tshirt", value: "L" },
          tags,
          assignees,
          parent: ticketId("T-9"),
          repo: "repo-1",
          branch: "chore/T-27-index-builders",
          pr: 172,
          prState: "open",
          prDraft: true,
          prBase: "main",
          lastTransitionedPr: 171,
          archivedAt,
          createdBy: "user-4",
          createdAt,
          updatedAt
        })

        const rows = ticketIndexRowsFor(project, [document])

        expect(rows).toEqual([
          {
            organizationId: "org-1",
            projectId: "project-1",
            ticketId: ticketId("T-27"),
            title: "Ship pure index builders",
            status: ticketStatus("in_progress"),
            type: "chore",
            priority: "high",
            estimateUnit: "tshirt",
            estimateValue: 4,
            tags: [tagName("backend"), tagName("urgent")],
            assignees: ["user-2", "user-3"],
            parent: ticketId("T-9"),
            movedFrom: [],
            repoId: "repo-1",
