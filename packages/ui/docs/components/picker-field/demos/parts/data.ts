// Sample sprints and epics for the Planning exploration. "Today" is
// Monday 23 November, so Sprint 14 is halfway.

export type DemoSprint = Readonly<{
  id: string
  name: string
  state: "active" | "planned"
  // Short dates, or null for a sprint without dates.
  range: string | null
  // Where it stands: "8 days left", "Starts Dec 1".
  when: string
  day: number
  days: number
  tickets: number
}>

export type DemoEpic = Readonly<{
  id: string
  title: string
  done: number
  total: number
}>

export const SPRINTS: ReadonlyArray<DemoSprint> = [
  {
    id: "s14",
    name: "Sprint 14",
    state: "active",
    range: "Nov 17 – Nov 30",
    when: "7 days left",
    day: 7,
    days: 14,
    tickets: 23
  },
  {
    id: "s15",
    name: "Sprint 15",
    state: "planned",
    range: "Dec 1 – Dec 14",
    when: "Starts Dec 1",
    day: 0,
    days: 14,
    tickets: 6
  },
  {
    id: "test",
    name: "test",
    state: "planned",
    range: null,
    when: "No dates",
    day: 0,
    days: 0,
    tickets: 1
  }
]

export const EPICS: ReadonlyArray<DemoEpic> = [
  {
    id: "T-212",
    title: "Custom ticket types and templates",
    done: 9,
    total: 11
  },
  {
    id: "T-240",
    title: "Inbox v1: notifications that matter",
    done: 2,
    total: 8
  },
  {
    id: "T-301",
    title: "Local-first data layer: instant reads, offline writes",
    done: 7,
    total: 12
  },
  {
    id: "T-318",
    title: "pp CLI sharing one token with the app",
    done: 0,
    total: 5
  }
]

export const sprintById = (id: string | null) =>
  SPRINTS.find((sprint) => sprint.id === id) ?? null

export const epicById = (id: string | null) =>
  EPICS.find((epic) => epic.id === id) ?? null

// Holds a ticket's sprint and epic, as the ticket page would.
export const START = { sprint: "s14", epic: "T-301" } as const
