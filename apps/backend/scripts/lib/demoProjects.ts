import {
  TAG_COLOR_WHEEL,
  type CreateProjectInput,
  type CreateStatusInput,
  type CreateTagInput,
  type CreateTicketInput,
  type UpdateProjectInput
} from "@pp/shared"

export type DemoPerson = "owner" | "teammate"

export type DemoSprintSlot = "active" | "planned"

export type DemoComment = Readonly<{
  author: DemoPerson
  body: string
}>

export type DemoTicket = Readonly<{
  ticket: Omit<typeof CreateTicketInput.Encoded, "assignees">
  assignees?: ReadonlyArray<DemoPerson>
  sprint?: DemoSprintSlot
  comments?: ReadonlyArray<DemoComment>
}>

export type DemoStatus = Readonly<{
  status: typeof CreateStatusInput.Encoded
  after: string
}>

export type DemoSprint = Readonly<{
  slot: DemoSprintSlot
  name: string
  startsInDays: number
  lengthInDays: number
}>

export type DemoProject = Readonly<{
  project: typeof CreateProjectInput.Encoded
  look: typeof UpdateProjectInput.Encoded
  statuses: ReadonlyArray<DemoStatus>
  tags: ReadonlyArray<typeof CreateTagInput.Encoded>
  sprints: ReadonlyArray<DemoSprint>
  tickets: ReadonlyArray<DemoTicket>
}>

export const demoTeammate = {
  email: "sanne.visser@example.com",
  name: "Sanne Visser",
  username: "sanne"
}

const wheel = {
  sage: TAG_COLOR_WHEEL[3].hex,
  sky: TAG_COLOR_WHEEL[5].hex,
  orange: TAG_COLOR_WHEEL[9].hex,
  amber: TAG_COLOR_WHEEL[10].hex,
  green: TAG_COLOR_WHEEL[12].hex,
  teal: TAG_COLOR_WHEEL[13].hex,
  cyan: TAG_COLOR_WHEEL[14].hex,
  blue: TAG_COLOR_WHEEL[16].hex,
  violet: TAG_COLOR_WHEEL[17].hex,
  pink: TAG_COLOR_WHEEL[19].hex
}

const md = (...lines: ReadonlyArray<string>) => lines.join("\n")

const mobileApp: DemoProject = {
  project: { name: "Mobile app", key: "APP" },
  look: {
    icon: "📱",
    color: wheel.blue,
    body: md(
      "# Mobile app",
      "",
      "The native iOS client for ProjectProject. It signs in to any server you add, keeps your projects close at hand, and stays useful on a train with no signal.",
      "",
      "## Goals for this quarter",
      "",
      "- Read tickets offline, and queue edits until the connection comes back.",
      "- Feel native: system controls, Liquid Glass where iOS puts it, and nothing that looks like a web view.",
      "- Cold start under 400 ms on an iPhone 13.",
      "",
      "## How we work",
      "",
      "Sprints run two weeks. Anything that isn't in a sprint lives in the backlog until planning. Put a ticket in review once the pull request is up, and move it to done after it ships in a TestFlight build."
    )
  },
  statuses: [
    {
      status: { label: "In review", icon: "Eye", color: wheel.amber },
      after: "in_progress"
    }
  ],
  tags: [
    { name: "offline", color: wheel.violet },
    { name: "sync", color: wheel.cyan },
    { name: "auth", color: wheel.green },
    { name: "design", color: wheel.pink },
    { name: "performance", color: wheel.orange },
    { name: "accessibility", color: wheel.teal },
    { name: "component:onboarding", color: wheel.sky }
  ],
  sprints: [
    { slot: "active", name: "Sprint 4", startsInDays: -4, lengthInDays: 14 },
    { slot: "planned", name: "Sprint 5", startsInDays: 10, lengthInDays: 14 }
  ],
  tickets: [
    {
      ticket: {
        title: "Cache the ticket list for offline reading",
        status: "in_progress",
        type: "feat",
        priority: "high",
        tags: ["offline", "sync"],
        body: md(
          "Keep the last fetched ticket list for each project on the device, so opening a project without a connection still shows something useful.",
          "",
          "- [x] Store the list response per project in SQLite",
          "- [x] Show the cached list first, then refresh in the background",
          "- [ ] Mark the list as stale when it's older than a day",
          "- [ ] Clear the cache when you sign out of a server",
          "",
          "The cache key has to include the server, since two servers can use the same org slug:",
          "",
          "```ts",
          "const cacheKey = `${instanceId}/${orgSlug}/${projectSlug}/tickets`",
          "```"
        )
      },
      assignees: ["owner"],
      sprint: "active",
      comments: [
        {
          author: "teammate",
          body: 'Should the stale marker show the time of the last refresh? Something like "Updated 3 hours ago" under the title.'
        },
        {
          author: "owner",
          body: "Yes, but only once it's older than an hour. Below that it's just noise."
        }
      ]
    },
    {
      ticket: {
        title: "Queue edits made offline and replay them on reconnect",
        status: "in_progress",
        type: "feat",
        priority: "high",
        tags: ["offline", "sync"],
        body: md(
          "When you change a ticket without a connection, the edit should land locally right away and go to the server once you're back online.",
          "",
          "## Scope",
          "",
          "- Status, priority, assignees and tags. Description edits come later, because they need a merge story.",
          "- Edits replay in the order they were made.",
          "- A failed replay (the ticket was deleted, or you lost access) shows up once, with a way to discard it.",
          "",
          "## Open questions",
          "",
          "1. Do we collapse several edits to the same field into one request?",
          "2. What happens when someone else changed the same field in the meantime? For now the last write wins, same as the web."
        )
      },
      assignees: ["teammate"],
      sprint: "active"
    },
    {
      ticket: {
        title: "Pull to refresh on the project list",
        status: "in_review",
        type: "feat",
        priority: "med",
        body: "Use the system refresh control on the project list, and keep the list on screen while it reloads."
      },
      assignees: ["owner"],
      sprint: "active"
    },
    {
      ticket: {
        title: "Keep the signed-in session when the server restarts",
        status: "in_review",
        type: "bug",
        priority: "high",
        tags: ["auth"],
        body: md(
          "After a backend restart the app drops back to the sign-in screen, even though the token is still valid.",
          "",
          "## Steps to reproduce",
          "",
          "1. Sign in to a local server.",
          "2. Restart the backend.",
          "3. Pull to refresh on any list.",
          "",
          "The first request fails with a network error while the server is down, and we treat that as a sign-out. Only a 401 should do that."
        )
      },
      assignees: ["owner"],
      sprint: "active",
      comments: [
        {
          author: "teammate",
          body: "Reviewed the fix. Works here after three restarts in a row. One nit: the retry banner flashes for a frame when the server comes back."
        }
      ]
    },
    {
      ticket: {
        title: "Show the server's name and logo on the switcher",
        status: "done",
        type: "feat",
        priority: "low",
        tags: ["design"],
        body: "Each saved server shows its name and logo, falling back to the first letter of the name when the server has no logo."
      },
      assignees: ["teammate"],
      sprint: "active"
    },
    {
      ticket: {
        title: "Crash when opening a ticket with an empty description",
        status: "done",
        type: "bug",
        priority: "high",
        body: md(
          "Opening a ticket whose description is empty crashes the markdown renderer.",
          "",
          "```",
          "TypeError: Cannot read properties of undefined (reading 'children')",
          "  at renderBlocks (Markdown.tsx:41)",
          "  at TicketBody (TicketBody.tsx:18)",
          "```",
          "",
          "Render nothing when the body is empty, and add a placeholder that invites you to write one."
        )
      },
      assignees: ["owner"],
      sprint: "active",
      comments: [
        {
          author: "owner",
          body: "Fixed in the renderer. An empty body now shows the placeholder, and the crash is gone from the latest build."
        }
      ]
    },
    {
      ticket: {
        title: "Render task lists in ticket descriptions",
        status: "todo",
        type: "feat",
        priority: "med",
        tags: ["design"],
        body: md(
          "Checklists in a description should render as real checkboxes that you can tick, and the change writes back to the markdown.",
          "",
          "- [ ] Render `- [ ]` and `- [x]` items",
          "- [ ] Toggle with a tap, with a light haptic",
          "- [ ] Save the toggle as a body update"
        )
      },
      assignees: ["teammate"],
      sprint: "active"
    },
    {
      ticket: {
        title: "Dynamic type support on ticket rows",
        status: "todo",
        type: "chore",
        priority: "med",
        tags: ["accessibility"],
        body: "Ticket rows clip their titles at the largest text sizes. Let the row grow, and wrap the title to two lines before truncating."
      },
      sprint: "active"
    },
    {
      ticket: {
        title: "Measure cold start on an iPhone 13",
        status: "in_progress",
        type: "chore",
        priority: "med",
        tags: ["performance"],
        body: md(
          "Get a baseline before we optimise anything. Measure from tapping the icon to the first list being interactive, in a Release build.",
          "",
          "| Build | Cold start |",
          "| --- | --- |",
          "| Debug | 1.9 s |",
          "| Release | to measure |"
        )
      },
      assignees: ["owner"],
      sprint: "active"
    },
    {
      ticket: {
        title: "Tap targets in the status picker are too small",
        status: "in_review",
        type: "bug",
        priority: "med",
        tags: ["accessibility", "design"],
        body: "The status options are 32 pt tall. Bring them up to 44 pt so they're easy to hit with a thumb."
      },
      assignees: ["teammate"],
      sprint: "active"
    },
    {
      ticket: {
        title: "Push notifications for mentions and assignments",
        status: "todo",
        type: "feat",
        priority: "high",
        body: md(
          "Tell people when someone mentions them in a comment or assigns them a ticket, even when the app is closed.",
          "",
          "## What we need",
          "",
          "- A device token endpoint on the server, scoped to the signed-in user and instance.",
          "- A notification per mention and per assignment, grouped by project.",
          "- Tapping a notification opens the ticket, and signs in to the right server first if needed.",
          "",
          "## Not in scope",
          "",
          "Notification settings per project. Everyone gets both kinds until we hear that it's too much."
        )
      },
      assignees: ["owner"],
      sprint: "planned"
    },
    {
      ticket: {
        title: "Change a ticket's status with a swipe",
        status: "todo",
        type: "feat",
        priority: "med",
        tags: ["design"],
        body: "Swipe a ticket row to move it to the next status, the way Mail archives a message."
      },
      sprint: "planned"
    },
    {
      ticket: {
        title: "Search tickets across projects",
        status: "todo",
        type: "feat",
        priority: "med",
        body: "One search field that looks through every project in the current org, with results grouped by project."
      },
      assignees: ["teammate"],
      sprint: "planned"
    },
    {
      ticket: {
        title: "Haptics on status changes",
        status: "todo",
        type: "chore",
        priority: "low",
        tags: ["design"]
      },
      sprint: "planned"
    },
    {
      ticket: {
        title: "Background refresh for the ticket list",
        status: "todo",
        type: "feat",
        priority: "low",
        tags: ["sync", "performance"],
        body: "Use background app refresh to update the cached lists a few times a day, so the app opens on fresh data."
      },
      sprint: "planned"
    },
    {
      ticket: {
        title: "Sign in with a passkey",
        status: "todo",
        type: "feat",
        priority: "med",
        tags: ["auth"],
        body: "Offer a passkey on the sign-in screen when the server supports it, next to the email code."
      }
    },
    {
      ticket: {
        title: "Home screen widget with my open tickets",
        status: "todo",
        type: "feat",
        priority: "low"
      }
    },
    {
      ticket: {
        title: "Create a ticket from the share sheet",
        status: "todo",
        type: "feat",
        priority: "low",
        body: "Share a link or some text to the app and turn it into a ticket in the project you pick."
      }
    },
    {
      ticket: {
        title: "Open attachments in Quick Look",
        status: "todo",
        type: "feat",
        priority: "med",
        body: "Images, PDFs and Figma exports should open in the system previewer, with the share button that comes with it."
      }
    },
    {
      ticket: {
        title: "Ticket detail jumps to the top after posting a comment",
        status: "in_progress",
        type: "bug",
        priority: "med",
        body: md(
          "After posting a comment the ticket reloads and the scroll position resets, so you lose the thread you were reading.",
          "",
          "Keep the scroll position, and scroll the new comment into view instead."
        )
      },
      assignees: ["teammate"],
      comments: [
        {
          author: "owner",
          body: "This happens on the web too when the comment list refetches. Might be worth fixing both in one go."
        }
      ]
    },
    {
      ticket: {
        title: "Muted text is hard to read in dark mode",
        status: "todo",
        type: "bug",
        priority: "low",
        tags: ["design", "accessibility"],
        body: "Secondary labels on the ticket detail fall below 4.5:1 contrast on the dark background."
      }
    },
    {
      ticket: {
        title: "Audit the bundle for unused dependencies",
        status: "todo",
        type: "chore",
        priority: "low",
        tags: ["performance"]
      }
    },
    {
      ticket: {
        title: "Write the release checklist for TestFlight",
        status: "todo",
        type: "chore",
        priority: "med",
        body: md(
          "- [ ] Bump the build number",
          "- [ ] Make a Release build and run it once without Metro",
          "- [ ] Check sign-in against a fresh local server",
          "- [ ] Write the what's new text",
          "- [ ] Upload and add the internal testers"
        )
      },
      assignees: ["owner"]
    },
    {
      ticket: {
        title: "Spike: iPad layout with a sidebar",
        status: "todo",
        type: "other",
        priority: "low",
        tags: ["design"],
        body: "Try a split view with projects in the sidebar and tickets on the right. Timebox it to two days and write up what we learn."
      }
    },
    {
      ticket: {
        title: "Remember the last used org per server",
        status: "done",
        type: "feat",
        priority: "med",
        body: "Reopening the app lands you in the org you used last on that server, instead of the first one in the list."
      },
      assignees: ["owner"]
    },
    {
      ticket: {
        title: "Explain what a server address is during onboarding",
        status: "done",
        type: "feat",
        priority: "med",
        tags: ["component:onboarding", "design"],
        body: "A short line under the address field, with an example, for people who've only ever used the web app."
      },
      assignees: ["teammate"]
    },
    {
      ticket: {
        title: "Dithered background on the sign-in screen",
        status: "done",
        type: "feat",
        priority: "low",
        tags: ["design", "component:onboarding"],
        body: "Port the web login's dither shader to Skia and draw it once per layout, not per frame."
      },
      assignees: ["owner"]
    },
    {
      ticket: {
        title: "Store tokens in the keychain",
        status: "done",
        type: "chore",
        priority: "high",
        tags: ["auth"],
        body: md(
          "Tokens move out of key-value storage and into the keychain, readable on this device only.",
          "",
          "```ts",
          "await SecureStore.setItemAsync(key, token, {",
          "  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY",
          "})",
          "```"
        )
      },
      assignees: ["owner"],
      comments: [
        {
          author: "teammate",
          body: "Confirmed that tokens don't come along in an encrypted backup restored to another phone."
        }
      ]
    }
  ]
}

const website: DemoProject = {
  project: { name: "Website", key: "WEB" },
  look: {
    icon: "🌐",
    color: wheel.green,
    body: md(
      "# Website",
      "",
      "The public site: landing page, pricing, docs and the changelog. Copy changes go through review like code does."
    )
  },
  statuses: [],
  tags: [
    { name: "copy", color: wheel.sage },
    { name: "seo", color: wheel.amber }
  ],
  sprints: [],
  tickets: [
    {
      ticket: {
        title: "Rewrite the landing page hero",
        status: "in_progress",
        type: "feat",
        priority: "med",
        tags: ["copy"],
        body: "Lead with markdown-first: your tickets are files you own. Drop the feature grid above the fold."
      },
      assignees: ["owner"]
    },
    {
      ticket: {
        title: "Pricing page for self-hosted plans",
        status: "todo",
        type: "feat",
        priority: "med",
        tags: ["copy"]
      },
      assignees: ["teammate"]
    },
    {
      ticket: {
        title: "Docs: deploy with Docker Compose",
        status: "done",
        type: "chore",
        priority: "med",
        body: md(
          "Walk through a first deploy from a clean server.",
          "",
          "```sh",
          "docker compose -f docker-compose.prod.yml up -d",
          "```"
        )
      },
      assignees: ["owner"]
    },
    {
      ticket: {
        title: "Open Graph images for blog posts",
        status: "todo",
        type: "feat",
        priority: "low",
        tags: ["seo"]
      }
    },
    {
      ticket: {
        title: "Footer links to the old changelog",
        status: "done",
        type: "bug",
        priority: "low"
      },
      assignees: ["teammate"],
      comments: [
        {
          author: "owner",
          body: "Thanks. I also added a redirect from the old path, since it's linked from a few blog posts."
        }
      ]
    },
    {
      ticket: {
        title: "Add a sitemap and robots.txt",
        status: "todo",
        type: "chore",
        priority: "low",
        tags: ["seo"]
      }
    }
  ]
}

export const demoProjects: ReadonlyArray<DemoProject> = [mobileApp, website]
