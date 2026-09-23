import { JiraMigrationConfiguration } from "@pp/shared"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { jiraDestinationConflicts } from "./Migrations"

const destination = Schema.decodeUnknownSync(JiraMigrationConfiguration)({
  destination: { name: "Application", slug: "fixture-application", key: "APP" },
  identities: [],
  statuses: [],
  issueTypes: [],
  priorities: [],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent: { policy: "exclude" },
  skippedAttachmentIds: [],
  attachmentSkipsAccepted: false
}).destination

it("reports exact global slug, organization key, and ticket ID conflicts", () => {
  expect(
    jiraDestinationConflicts({
      organizationId: "current-org",
      currentProjectId: "current-project",
      destination,
      destinationTicketIds: ["APP-1", "APP-2"],
      projects: [
        {
          id: "another-org-project",
          organizationId: "another-org",
          slug: "fixture-application",
          key: "APP"
        },
        {
          id: "existing-project",
          organizationId: "current-org",
          slug: "fixture-application-2",
          key: "APP"
        },
        {
          id: "current-project",
          organizationId: "current-org",
          slug: "fixture-application",
          key: "APP"
        }
      ],
      tickets: [
        { projectId: "existing-project", ticketId: "APP-1" },
        { projectId: "another-org-project", ticketId: "APP-2" },
        { projectId: "current-project", ticketId: "APP-2" }
      ]
    })
  ).toEqual([
    { kind: "project_slug", value: "fixture-application" },
    { kind: "project_key", value: "APP" },
    { kind: "ticket_id", value: "APP-1" }
  ])
})
