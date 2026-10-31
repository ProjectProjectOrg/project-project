import { type StatusPhase, statusPhaseOf } from "@pp/shared"
import * as DateTime from "effect/DateTime"

import { barChart, heatmap, meter } from "../../vendor/glyph-kit/core.mjs"
import { paintShades } from "./dither"
import { LOGO_SHARE, markWith } from "./mark"
import { muted, strong, type Terminal } from "./terminal"

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS = 12

export type OverviewInput = Readonly<{
  scope: string
  statuses: ReadonlyArray<
    Readonly<{ slug: string; label: string; orderKey: string }>
  >
  tickets: ReadonlyArray<
    Readonly<{ id: string; status: string; createdAt: Date }>
  >
  sprint:
    | Readonly<{
        id: string
        name: string
        tickets: ReadonlyArray<string>
        endsAt: Date | null
      }>
    | undefined
  now: DateTime.Zoned
}>

type PhaseCounts = Readonly<Record<StatusPhase, number>>

export type Overview = Readonly<{
  scope: string
  sprint: Readonly<
    {
      id: string
      name: string
      endsAt: string | null
      daysLeft: number | null
    } & PhaseCounts
  > | null
  statuses: ReadonlyArray<
    Readonly<{ slug: string; label: string; phase: StatusPhase; count: number }>
  >
  created: ReadonlyArray<Readonly<{ date: string; count: number }>>
}>

const firstShownDay = (today: DateTime.Zoned) =>
  DateTime.subtract(today, {
    days: ((DateTime.getPart(today, "weekDay") + 6) % 7) + (WEEKS - 1) * 7
  })

const daysBetween = (from: DateTime.DateTime, to: DateTime.DateTime) =>
  Math.round(
    (DateTime.toEpochMillis(to) - DateTime.toEpochMillis(from)) / DAY_MS
  )

export const summarize = (input: OverviewInput): Overview => {
  const phaseOf = (slug: string) => statusPhaseOf(input.statuses, slug)
  const countBy = (slug: string) =>
    input.tickets.filter((ticket) => ticket.status === slug).length
  const sprint = input.sprint
  const inSprint = new Set<string>(sprint?.tickets ?? [])
  const sprintPhases = input.tickets
    .filter((ticket) => inSprint.has(ticket.id))
    .map((ticket) => phaseOf(ticket.status))
  const count = (phase: StatusPhase) =>
    sprintPhases.filter((found) => found === phase).length
  const local = (date: Date) =>
    DateTime.setZone(DateTime.fromDateUnsafe(date), input.now.zone)
  const today = DateTime.startOf(input.now, "day")
  const first = firstShownDay(today)
  const days = daysBetween(first, today) + 1
  const createdOn = new Map<string, number>()
  for (const ticket of input.tickets) {
    const key = DateTime.formatIsoDate(local(ticket.createdAt))
    createdOn.set(key, (createdOn.get(key) ?? 0) + 1)
  }
  return {
    scope: input.scope,
    sprint:
      sprint === undefined
        ? null
        : {
            id: sprint.id,
            name: sprint.name,
            endsAt:
              sprint.endsAt === null
                ? null
                : DateTime.formatIsoDate(local(sprint.endsAt)),
            daysLeft:
              sprint.endsAt === null
                ? null
                : Math.max(
                    0,
                    daysBetween(
                      today,
                      DateTime.startOf(local(sprint.endsAt), "day")
                    )
                  ),
            unstarted: count("unstarted"),
            started: count("started"),
            finished: count("finished")
          },
    statuses: input.statuses.map((status) => ({
      slug: status.slug,
      label: status.label,
      phase: phaseOf(status.slug),
      count: countBy(status.slug)
    })),
    created: Array.from({ length: days }, (_, index) => {
      const date = DateTime.formatIsoDate(DateTime.add(first, { days: index }))
      return { date, count: createdOn.get(date) ?? 0 }
    })
  }
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`

const heading = (text: string, terminal: Terminal) =>
  muted(text.toUpperCase(), terminal)

const focus = (text: string, terminal: Terminal) =>
  `${muted("►", terminal)} ${text}`

const chart = (figure: string, terminal: Terminal) =>
  figure.split("\n").map((line) => paintShades(line, terminal))

const sprintLines = (overview: Overview, terminal: Terminal, grow: number) => {
  const sprint = overview.sprint
  if (sprint === null) {
    return [
      heading("Sprint", terminal),
      focus("No sprint running. Plan one with `pp sprints create`.", terminal)
    ]
  }
  const total = sprint.finished + sprint.started + sprint.unstarted
  const left =
    sprint.daysLeft === null
      ? "no end date"
      : sprint.daysLeft === 0
        ? "ends today"
        : `${plural(sprint.daysLeft, "day")} left`
  return [
    `${heading("Sprint", terminal)}  ${strong(sprint.name, terminal)} ${muted(sprint.id, terminal)}`,
    ...chart(
      meter(sprint.finished * grow, total, {
        width: 40,
        label: `done, ${Math.round(sprint.finished * grow)} of ${total}`
      }),
      terminal
    ),
    settled(
      grow,
      focus(
        `${left} · ${sprint.started} in progress · ${sprint.unstarted} to start`,
        terminal
      )
    )
  ]
}

const statusLines = (overview: Overview, terminal: Terminal, grow: number) => [
  heading("Tickets by status", terminal),
  ...chart(
    barChart(
      overview.statuses.map((status) => ({
        label: status.label,
        value: status.count * grow,
        text: `${Math.round(status.count * grow)}`
      })),
      {
        width: 28,
        empty: "░",
        max: Math.max(1, ...overview.statuses.map((status) => status.count))
      }
    ),
    terminal
  )
]

const dayLabel = (key: string, options: Intl.DateTimeFormatOptions) =>
  DateTime.format(DateTime.makeUnsafe(key), { locale: "en-GB", ...options })

const CELL = 2

const createdLines = (overview: Overview, terminal: Terminal, grow: number) => {
  const max = Math.max(1, ...overview.created.map((day) => day.count))
  const weeks = Math.ceil(overview.created.length / 7)
  const monthRow = Array.from({ length: weeks }, (_, week) => week).reduce(
    (row, week) => {
      const day = overview.created[week * 7]
      const previous = overview.created[(week - 1) * 7]
      const starts =
        day !== undefined &&
        (previous === undefined ||
          day.date.slice(5, 7) !== previous.date.slice(5, 7))
      return !starts || row.length > week * CELL
        ? row
        : `${row.padEnd(week * CELL)}${dayLabel(day.date, { month: "short" })}`
    },
    ""
  )
  const grid = Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: weeks }, (_, week) => {
      const day = overview.created[week * 7 + weekday]
      const develop = Math.min(
        1,
        Math.max(0, grow * 1.6 - (week / weeks) * 0.6)
      )
      return day === undefined ? 0 : (day.count / max) * develop
    })
  )
  const busiest = overview.created.reduce<
    Readonly<{ date: string; count: number }> | undefined
  >((best, day) => (day.count > (best?.count ?? 0) ? day : best), undefined)
  const total = overview.created.reduce((sum, day) => sum + day.count, 0)
  return [
    heading(`Tickets created, last ${WEEKS} weeks`, terminal),
    ...chart(
      heatmap(grid, {
        rowLabels: ["Mon", "", "Wed", "", "Fri", "", "Sun"],
        colLabels: monthRow,
        cellWidth: CELL
      }),
      terminal
    ),
    settled(
      grow,
      focus(
        busiest === undefined
          ? "Nothing new in this stretch."
          : `${plural(total, "ticket")} · busiest ${dayLabel(busiest.date, { weekday: "short", day: "numeric", month: "short" })} with ${busiest.count}`,
        terminal
      )
    )
  ]
}

const settled = (grow: number, line: string) => (grow >= 1 ? line : "")

const easeOut = (progress: number) => 1 - (1 - progress) ** 3

export const drawOverview = (
  overview: Overview,
  who: Readonly<{ server: string; user: string }>,
  terminal: Terminal,
  progress = 1
): ReadonlyArray<string> => {
  const grow = easeOut(
    Math.min(1, Math.max(0, (progress - LOGO_SHARE) / (1 - LOGO_SHARE)))
  )
  return [
    ...markWith(
      [
        strong("ProjectProject", terminal),
        overview.scope,
        muted(`${who.server} · ${who.user}`, terminal)
      ],
      terminal,
      progress
    ),
    "",
    ...sprintLines(overview, terminal, grow),
    "",
    ...statusLines(overview, terminal, grow),
    "",
    ...createdLines(overview, terminal, grow)
  ].map((line) => (line === "" ? "" : `  ${line}`))
}
