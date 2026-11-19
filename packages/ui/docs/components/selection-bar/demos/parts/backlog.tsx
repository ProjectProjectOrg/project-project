import {
  AUDIT,
  CRASH,
  FOCUS,
  INVITED,
  type Priority,
  type SampleTicket,
  type Status
} from "../../../list-row/demos/parts/tickets"

/*
 * The selection bar demo's backlog: twelve tickets with a bit of
 * everything, so every menu has several values to count, and the helpers
 * that count a selection of them.
 */

export const STATUSES: ReadonlyArray<Status> = [
  "todo",
  "progress",
  "review",
  "done"
]
export const PRIORITIES: ReadonlyArray<Priority> = ["urgent", "medium", "low"]

export const PEOPLE = [
  { id: "u1", name: "Wouter Missler" },
  { id: "u2", name: "Sam Rivera" },
  { id: "u3", name: "Noor Haddad" },
  { id: "u4", name: "Lena Brandt" },
  { id: "u5", name: "Tomás Ortega" },
  { id: "u6", name: "Mia Chen" }
] as const

export const TAGS: ReadonlyArray<Readonly<{ name: string; color: string }>> = [
  { name: "onboarding", color: "oklch(0.7 0.15 150)" },
  { name: "crash", color: "oklch(0.65 0.2 25)" },
  { name: "android", color: "oklch(0.72 0.15 140)" },
  { name: "ios", color: "oklch(0.7 0.02 260)" },
  { name: "offline", color: "oklch(0.7 0.13 250)" },
  { name: "sync", color: "oklch(0.72 0.14 190)" },
  { name: "maps", color: "oklch(0.75 0.14 80)" },
  { name: "accessibility", color: "oklch(0.68 0.16 300)" }
]

const tags = (...names: ReadonlyArray<string>) =>
  TAGS.filter((tag) => names.includes(tag.name))

export const SPRINTS = ["Sprint 23", "Sprint 24", "Sprint 25"] as const

export type DemoTicket = SampleTicket

export const TICKETS: ReadonlyArray<DemoTicket> = [
  { ...INVITED, sprint: undefined },
  { ...AUDIT, sprint: "Sprint 24" },
  { ...FOCUS, sprint: "Sprint 24" },
  { ...CRASH, sprint: "Sprint 25" },
  {
    id: "ATL-31",
    title: "Download map tiles for a whole trip in one step",
    status: "progress",
    priority: "medium",
    tags: tags("maps", "offline"),
    assignee: PEOPLE[2],
    sprint: "Sprint 25"
  },
  {
    id: "ATL-33",
    title: "Map labels are unreadable on the dark map style",
    status: "todo",
    priority: "low",
    tags: tags("maps", "accessibility"),
    assignee: PEOPLE[3],
    sprint: "Sprint 23"
  },
  {
    id: "ATL-36",
    title: "Resume a sync that was interrupted when the app was killed",
    status: "review",
    priority: "urgent",
    tags: tags("sync", "offline"),
    assignee: PEOPLE[4],
    sprint: "Sprint 25"
  },
  {
    id: "ATL-38",
    title: "Sync offline edits made on two devices",
    status: "progress",
    priority: "urgent",
    tags: tags("sync", "ios"),
    assignee: PEOPLE[5],
    sprint: "Sprint 24"
  },
  {
    id: "ATL-41",
    title: "Make the day timeline usable with VoiceOver",
    status: "done",
    priority: "medium",
    tags: tags("accessibility", "ios"),
    assignee: PEOPLE[1],
    sprint: "Sprint 23"
  },
  {
    id: "ATL-42",
    title: "Update the maps SDK before the old one stops working",
    status: "todo",
    priority: "medium",
    tags: tags("maps", "android")
  },
  {
    id: "ATL-45",
    title: "Crash on rotate while the camera sheet is open",
    status: "progress",
    priority: "urgent",
    tags: tags("crash", "android"),
    assignee: PEOPLE[2],
    sprint: "Sprint 25"
  },
  {
    id: "ATL-47",
    title: "Welcome screen copy for teams on the free plan",
    status: "todo",
    priority: "low",
    tags: tags("onboarding"),
    assignee: PEOPLE[0]
  }
]

export const countOf = <T,>(
  rows: ReadonlyArray<DemoTicket>,
  valueOf: (row: DemoTicket) => T
) => {
  const counts = new Map<T, number>()
  for (const row of rows)
    counts.set(valueOf(row), (counts.get(valueOf(row)) ?? 0) + 1)
  return counts
}

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`
