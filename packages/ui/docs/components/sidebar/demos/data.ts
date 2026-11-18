import { STRONG_RING } from "@pp/shared"

export type Status = "todo" | "progress" | "review" | "done"

export type Priority = "low" | "med" | "high"

export type SprintState = "planned" | "active" | "completed"

export type Project = Readonly<{
  slug: string
  name: string
  key: string
  icon: string
  // The project's colour, from the palette the app's picker offers.
  tone: string
  sprint: string | null
  // One of the app's built-in Claude Monet banners; without one the header
  // shows the project colour's dither.
  banner?: "water_lily_pond" | "bordighera"
}>

export type Ticket = readonly [
  id: string,
  title: string,
  status: Status,
  priority: Priority
]

export type Sprint = readonly [
  id: string,
  name: string,
  when: string,
  state: SprintState
]

export type Page =
  | "overview"
  | "projects"
  | "backlog"
  | "sprints"
  | "about"
  | "ticket"
  | "sprint"
  | "settings"

export type Route = Readonly<{ page: Page; id?: string }>

export type PinRef = Readonly<{ kind: "ticket" | "sprint"; id: string }>

export const PROJECTS: ReadonlyArray<Project> = [
  {
    slug: "atl",
    name: "Atlas Mobile App",
    key: "ATL",
    icon: "🧭",
    tone: STRONG_RING[11].hex,
    sprint: "Sprint 24 · 6d left",
    banner: "water_lily_pond"
  },
  {
    slug: "bil",
    name: "Billing Platform",
    key: "BIL",
    icon: "💳",
    tone: STRONG_RING[8].hex,
    sprint: "Sprint 24 · 6d left",
    banner: "bordighera"
  },
  {
    slug: "web",
    name: "Marketing Site",
    key: "WEB",
    icon: "📣",
    tone: STRONG_RING[2].hex,
    sprint: "Sprint 24 · 6d left"
  },
  {
    slug: "hello",
    name: "Hello",
    key: "HELL",
    icon: "🪐",
    tone: STRONG_RING[4].hex,
    sprint: null
  }
]

export const TICKETS = new Map<string, ReadonlyArray<Ticket>>([
  [
    "atl",
    [
      [
        "ATL-3",
        "Sync conflict resolution for checklist items",
        "progress",
        "high"
      ],
      [
        "ATL-6",
        "Photo uploads retry with backoff after reconnect",
        "todo",
        "high"
      ],
      ["ATL-13", "Cold start under 1.5s on Pixel 6a", "progress", "high"],
      ["ATL-4", "Download map tiles for a job's area", "review", "med"],
      ["ATL-16", "Map pins flicker when zooming on iOS 19", "todo", "high"],
      ["ATL-17", "Crash when opening a job with no address", "done", "high"]
    ]
  ],
  [
    "bil",
    [
      ["BIL-2", "Usage line items on invoices", "progress", "high"],
      ["BIL-7", "Apply reverse charge for B2B customers", "progress", "high"],
      [
        "BIL-10",
        "Proration is off by one day for annual plans",
        "review",
        "high"
      ],
      ["BIL-9", "Show VAT breakdown on invoice PDF", "todo", "med"]
    ]
  ],
  [
    "web",
    [
      ["WEB-1", "New pricing page", "progress", "high"],
      ["WEB-3", "Launch blog post", "todo", "high"],
      ["WEB-8", "Cookie banner covers the footer on mobile", "todo", "med"]
    ]
  ],
  ["hello", [["HELL-1", "Say hello", "todo", "low"]]]
])

export const SPRINTS: ReadonlyArray<Sprint> = [
  ["s23", "Sprint 23", "Ended", "completed"],
  ["s24", "Sprint 24", "6d left", "active"],
  ["s25", "Sprint 25", "Starts in 8d", "planned"]
]

export const findTicket = (id: string) =>
  [...TICKETS.values()].flat().find((ticket) => ticket[0] === id)

export const findSprint = (id: string) =>
  SPRINTS.find((sprint) => sprint[0] === id)

// Sub-tickets: the ticket each sits under.
export const PARENTS: ReadonlyMap<string, string> = new Map([
  ["ATL-6", "ATL-3"],
  ["ATL-16", "ATL-4"]
])

export const samePin = (a: PinRef | null, b: PinRef | null) =>
  a !== null && b !== null && a.kind === b.kind && a.id === b.id

export const SETTINGS = [
  ["general", "General"],
  ["members", "Members"],
  ["workflow", "Workflow"],
  ["tags", "Tags"],
  ["estimation", "Estimation"],
  ["github", "GitHub"],
  ["danger", "Danger zone"]
] as const

export type SettingsSection = (typeof SETTINGS)[number][0]

export const livePin = (route: Route) =>
  (route.page === "ticket" || route.page === "sprint") && route.id
    ? { kind: route.page, id: route.id }
    : null

export const pinKey = (slug: string, pin: PinRef) =>
  `${slug}:${pin.kind}:${pin.id}`
