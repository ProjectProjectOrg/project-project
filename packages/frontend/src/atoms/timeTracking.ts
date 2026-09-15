import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  GroupId,
  type ActiveTimer,
  type LogTimeInput,
  type PersonalEverhour,
  type StartSprintTimerInput,
  type StartTimerInput,
  type TicketId,
  type TicketTimeSummary,
  type WorkTypeOption
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { everhourProfileAtom } from "./everhour"

export interface ActiveTimerRequest {
  readonly params: { readonly orgSlug: string }
}

export interface TicketTimeRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: TicketId
  }
}

export interface SprintTimerRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: GroupId
  }
}

export interface ProjectTimeRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly entityId: TicketId | GroupId | null
}

export const activeTimerRequest = (orgSlug: string): ActiveTimerRequest => ({
  params: { orgSlug }
})

export const ticketTimeRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TicketTimeRequest => ({ params: { orgSlug, slug, id } })

export const sprintTimerRequest = (
  orgSlug: string,
  slug: string,
  id: GroupId
): SprintTimerRequest => ({ params: { orgSlug, slug, id } })

export const projectTimeRequest = (
  orgSlug: string,
  slug: string,
  entityId: TicketId | GroupId | null
): ProjectTimeRequest => ({
  params: { orgSlug, slug },
  entityId
})

const scopeOf = (
  req: TicketTimeRequest | SprintTimerRequest | ProjectTimeRequest
) => projectScope(req.params.orgSlug, req.params.slug)

const fallbackGroupId = Schema.decodeSync(GroupId)("G-1")

const activeTimerQuery = (req: ActiveTimerRequest) =>
  Api.query("everhour", "currentTimer", {
    params: req.params,
    timeToLive: "15 seconds",
    reactivityKeys: [Keys.activeTimer(req.params.orgSlug)]
  })

export const activeTimerAtom = Atom.family((req: ActiveTimerRequest) =>
  Atom.optimistic(activeTimerQuery(req))
)

const workTypesQuery = (req: TicketTimeRequest) =>
  Api.query("everhour", "ticketWorkTypes", {
    params: req.params,
    timeToLive: "1 minute",
    reactivityKeys: [Keys.workTypes(scopeOf(req))]
  })

export const workTypesForTicketAtom = Atom.family((req: TicketTimeRequest) =>
  Atom.optimistic(workTypesQuery(req))
)

const ticketTimeQuery = (req: TicketTimeRequest) =>
  Api.query("everhour", "ticketTime", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.ticketTime(scopeOf(req), req.params.id)]
  })

export const ticketTimeAtom = Atom.family((req: TicketTimeRequest) =>
  Atom.optimistic(ticketTimeQuery(req))
)

export interface TicketTimePanelValue {
  readonly profile: PersonalEverhour
  readonly workTypes: ReadonlyArray<WorkTypeOption>
  readonly time: TicketTimeSummary
  readonly activeTimer: ActiveTimer | null
}

const ticketTimePanelView = (req: TicketTimeRequest) => {
  const timerReq = activeTimerRequest(req.params.orgSlug)
  return Atom.readable(
    (get) =>
      AsyncResult.map(
        AsyncResult.all([
          get(everhourProfileAtom),
          get(workTypesForTicketAtom(req)),
          get(ticketTimeAtom(req)),
          get(activeTimerAtom(timerReq))
        ]),
        ([profile, workTypes, time, activeTimer]): TicketTimePanelValue => ({
          profile,
          workTypes,
          time,
          activeTimer
        })
      ),
    (refresh) => {
      refresh(everhourProfileAtom)
      refresh(workTypesForTicketAtom(req))
      refresh(ticketTimeAtom(req))
      refresh(activeTimerAtom(timerReq))
    }
  )
}

export const ticketTimePanelAtom = Atom.family((req: TicketTimeRequest) =>
  Atom.optimistic(ticketTimePanelView(req))
)

const optimisticTimer = (
  current: ActiveTimer | null,
  params: {
    readonly slug: string
    readonly id?: TicketId
    readonly groupId?: GroupId
  },
  input: StartTimerInput | StartSprintTimerInput
): ActiveTimer => ({
  slug: params.slug,
  ticketId: params.id ?? null,
  ticketTitle: null,
  groupId: params.groupId ?? current?.groupId ?? fallbackGroupId,
  workTypeKey: input.workTypeKey,
  workTypeLabel: input.workTypeKey,
  everhourTaskId: current?.everhourTaskId ?? "",
  startedAt: DateTime.toDate(DateTime.nowUnsafe())
})

const previousTicketKey = (
  orgSlug: string,
  timer: ActiveTimer | null,
  except?: TicketId
): string | null =>
  timer?.ticketId && timer.ticketId !== except
    ? Keys.ticketTime(projectScope(orgSlug, timer.slug), timer.ticketId)
    : null

export const startTicketTimerAtom = Atom.family((req: TicketTimeRequest) => {
  const timerReq = activeTimerRequest(req.params.orgSlug)
  return Atom.optimisticFn(ticketTimePanelAtom(req), {
    reducer: (current, input: StartTimerInput) =>
      AsyncResult.map(current, (panel) => ({
        ...panel,
        activeTimer: optimisticTimer(panel.activeTimer, req.params, input)
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: StartTimerInput, get) {
          const previous = get(activeTimerQuery(timerReq))
          const keyToInvalidate = previousTicketKey(
            req.params.orgSlug,
            AsyncResult.isSuccess(previous) ? previous.value : null,
            req.params.id
          )
          const timer = yield* Api.use((client) =>
            client.everhour.startTicketTimer({
              params: req.params,
              payload: input
            })
          )
          set(
            AsyncResult.map(get(ticketTimePanelAtom(req)), (panel) => ({
              ...panel,
              activeTimer: timer
            }))
          )
          if (keyToInvalidate) {
            yield* Reactivity.invalidate([keyToInvalidate])
          }
          return timer
        })
      )
  })
})

export const startActiveTicketTimerAtom = Atom.family(
  ({
    timerReq,
    ticketReq
  }: {
    readonly timerReq: ActiveTimerRequest
    readonly ticketReq: TicketTimeRequest
  }) =>
    Atom.optimisticFn(activeTimerAtom(timerReq), {
      reducer: (current, input: StartTimerInput) =>
        AsyncResult.map(current, (timer) =>
          optimisticTimer(timer, ticketReq.params, input)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: StartTimerInput, get) {
            const previous = get(activeTimerQuery(timerReq))
            const keyToInvalidate = previousTicketKey(
              timerReq.params.orgSlug,
              AsyncResult.isSuccess(previous) ? previous.value : null,
              ticketReq.params.id
            )
            const timer = yield* Api.use((client) =>
              client.everhour.startTicketTimer({
                params: ticketReq.params,
                payload: input
              })
            )
            set(AsyncResult.success(timer))
            yield* Reactivity.invalidate([
              Keys.ticketTime(scopeOf(ticketReq), ticketReq.params.id),
              ...(keyToInvalidate ? [keyToInvalidate] : [])
            ])
            return timer
          })
        )
    })
)

export const startSprintTimerAtom = Atom.family(
  ({
    timerReq,
    sprintReq
  }: {
    readonly timerReq: ActiveTimerRequest
    readonly sprintReq: SprintTimerRequest
  }) =>
    Atom.optimisticFn(activeTimerAtom(timerReq), {
      reducer: (current, input: StartSprintTimerInput) =>
        AsyncResult.map(current, (timer) =>
          optimisticTimer(
            timer,
            { slug: sprintReq.params.slug, groupId: sprintReq.params.id },
            input
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: StartSprintTimerInput, get) {
            const previous = get(activeTimerQuery(timerReq))
            const keyToInvalidate = previousTicketKey(
              timerReq.params.orgSlug,
              AsyncResult.isSuccess(previous) ? previous.value : null
            )
            const timer = yield* Api.use((client) =>
              client.everhour.startSprintTimer({
                params: sprintReq.params,
                payload: input
              })
            )
            set(AsyncResult.success(timer))
            if (keyToInvalidate) {
              yield* Reactivity.invalidate([keyToInvalidate])
            }
            return timer
          })
        )
    })
)

export const optimisticStopTimer = <E>(
  current: AsyncResult.AsyncResult<ActiveTimer | null, E>
): AsyncResult.AsyncResult<ActiveTimer | null, E> =>
  AsyncResult.map(current, () => null)

export const stopTimerAtom = Atom.family((req: ActiveTimerRequest) =>
  Atom.optimisticFn(activeTimerAtom(req), {
    reducer: (current, _input: void) => AsyncResult.map(current, () => null),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const stopped = yield* Api.use((client) =>
            client.everhour.stopTimer({ params: req.params })
          )
          set(AsyncResult.success(null))
          const keyToInvalidate = previousTicketKey(req.params.orgSlug, stopped)
          if (keyToInvalidate) {
            yield* Reactivity.invalidate([keyToInvalidate])
          }
          return stopped
        })
      )
  })
)

export const stopTicketTimerAtom = Atom.family((req: TicketTimeRequest) =>
  Atom.optimisticFn(ticketTimePanelAtom(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (panel) => ({ ...panel, activeTimer: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void, get) {
          const stopped = yield* Api.use((client) =>
            client.everhour.stopTimer({
              params: { orgSlug: req.params.orgSlug }
            })
          )
          set(
            AsyncResult.map(get(ticketTimePanelAtom(req)), (panel) => ({
              ...panel,
              activeTimer: null
            }))
          )
          const keyToInvalidate = previousTicketKey(
            req.params.orgSlug,
            stopped,
            req.params.id
          )
          if (keyToInvalidate) {
            yield* Reactivity.invalidate([keyToInvalidate])
          }
          return stopped
        })
      )
  })
)

export const logTicketTimeAtom = Atom.family((req: TicketTimeRequest) =>
  Atom.optimisticFn(ticketTimePanelAtom(req), {
    reducer: (current, input: LogTimeInput) =>
      AsyncResult.map(current, (panel) => ({
        ...panel,
        time: {
          ...panel.time,
          totalSeconds: panel.time.totalSeconds + input.seconds,
          userSeconds: panel.time.userSeconds + input.seconds
        }
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: LogTimeInput, get) {
          const summary = yield* Api.use((client) =>
            client.everhour.logTime({
              params: {
                orgSlug: req.params.orgSlug,
                slug: req.params.slug
              },
              payload: input
            })
          )
          set(
            AsyncResult.map(get(ticketTimePanelAtom(req)), (panel) => ({
              ...panel,
              time: summary ?? panel.time
            }))
          )
          return summary
        })
      )
  })
)

export const logTimeAtom = Atom.family((req: ProjectTimeRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (input: LogTimeInput) {
      const summary = yield* Api.use((client) =>
        client.everhour.logTime({ params: req.params, payload: input })
      )
      if (input.ticketId) {
        yield* Reactivity.invalidate([
          Keys.ticketTime(scopeOf(req), input.ticketId)
        ])
      }
      return summary
    })
  )
)
