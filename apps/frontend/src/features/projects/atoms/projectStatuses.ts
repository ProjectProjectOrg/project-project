import {
  deriveStatusSlug,
  StatusSlug,
  StatusColor,
  OrderKey,
  pickStatusColor,
  type CreateStatusInput,
  type DeleteStatusInput,
  type ProjectStatus,
  type ReorderStatusInput,
  type UpdateStatusInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { fireMutation, viewMutation } from "@/api/viewMutation"
import { compareByOrderKey } from "@/lib/orderKey"

export type StatusesRequest = Readonly<{
  _view: "statuses"
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const statusesRequest = (
  orgSlug: string,
  slug: string
): StatusesRequest => ({
  _view: "statuses",
  params: { orgSlug, slug }
})

const scopeOf = (req: StatusesRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const statusesQuery = (req: StatusesRequest) =>
  Api.query("statuses", "list", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.statuses(scopeOf(req))]
  })

export const statusesFor = Atom.family((req: StatusesRequest) =>
  Atom.optimistic(statusesQuery(req))
)

type StatusKey = Readonly<{
  req: StatusesRequest
  statusSlug: StatusSlug
}>

const replaceStatus = (
  statuses: ReadonlyArray<ProjectStatus>,
  statusSlug: StatusSlug,
  update: (status: ProjectStatus) => ProjectStatus
) =>
  statuses.map((status) =>
    status.slug === statusSlug ? update(status) : status
  )

const syntheticStatus = (
  statuses: ReadonlyArray<ProjectStatus>,
  input: CreateStatusInput
): ReadonlyArray<ProjectStatus> => {
  const derivedSlug = deriveStatusSlug(input.label)
  if (derivedSlug.length === 0) return statuses
  if (statuses.some((status) => status.slug === derivedSlug)) return statuses
  const synthetic: ProjectStatus = {
    slug: StatusSlug.make(derivedSlug),
    label: input.label,
    icon: input.icon ?? "Circle",
    color:
      input.color ??
      StatusColor.make(pickStatusColor(statuses.map((status) => status.color))),
    orderKey: OrderKey.make("zzz"),
    description: null,
    createdBy: "",
    createdAt: DateTime.toDate(DateTime.nowUnsafe())
  }
  return [...statuses, synthetic]
}

export const createStatus = Atom.family((req: StatusesRequest) =>
  viewMutation(statusesFor(req), {
    name: "createStatus",
    predict: syntheticStatus,
    call: (client, input) =>
      client.statuses.create({ params: req.params, payload: input }),
    confirm: (statuses, created, input) =>
      replaceStatus(
        statuses,
        StatusSlug.make(deriveStatusSlug(input.label)),
        () => created
      )
  })
)

const statusRenameKeys = (req: StatusesRequest) => [
  ...Keys.ticketsChanged(scopeOf(req)),
  Keys.gitAutomation(scopeOf(req))
]

export const updateStatus = Atom.family(({ req, statusSlug }: StatusKey) =>
  viewMutation(statusesFor(req), {
    name: "updateStatus",
    predict: (statuses, patch: UpdateStatusInput) =>
      replaceStatus(statuses, statusSlug, (status) => ({
        ...status,
        label: patch.label ?? status.label,
        icon: patch.icon ?? status.icon,
        color: patch.color ?? status.color,
        description:
          patch.description === undefined
            ? status.description
            : patch.description
      })),
    call: (client, patch) =>
      client.statuses.update({
        params: { ...req.params, statusSlug },
        payload: patch
      }),
    confirm: (statuses, updated) =>
      replaceStatus(statuses, statusSlug, () => updated),
    publish: (_updated, patch) =>
      patch.label === undefined ? [] : statusRenameKeys(req)
  })
)

export const reorderStatus = Atom.family(({ req, statusSlug }: StatusKey) =>
  viewMutation(statusesFor(req), {
    name: "reorderStatus",
    predict: (statuses, input: ReorderStatusInput) =>
      replaceStatus(statuses, statusSlug, (status) => ({
        ...status,
        orderKey: input.orderKey
      })).toSorted(compareByOrderKey),
    call: (client, input) =>
      client.statuses.reorder({
        params: { ...req.params, statusSlug },
        payload: input
      }),
    confirm: (statuses, reordered) =>
      replaceStatus(statuses, statusSlug, () => reordered).toSorted(
        compareByOrderKey
      )
  })
)

export type StatusReorder = Readonly<{
  statusSlug: StatusSlug
  orderKey: ReorderStatusInput["orderKey"]
}>

export const dispatchStatusReorders = Atom.family((req: StatusesRequest) =>
  Atom.fnSync((reorders: ReadonlyArray<StatusReorder>, get) => {
    for (const { statusSlug, orderKey } of reorders) {
      void fireMutation(get.registry, reorderStatus({ req, statusSlug }), {
        orderKey
      })
    }
  })
)

const withoutStatus = (
  statuses: ReadonlyArray<ProjectStatus>,
  statusSlug: StatusSlug
) => statuses.filter((status) => status.slug !== statusSlug)

export const deleteStatus = Atom.family(({ req, statusSlug }: StatusKey) =>
  viewMutation(statusesFor(req), {
    name: "deleteStatus",
    predict: (statuses, _input: DeleteStatusInput) =>
      withoutStatus(statuses, statusSlug),
    call: (client, input) =>
      client.statuses.remove({
        params: { ...req.params, statusSlug },
        query: input
      }),
    confirm: (statuses) => withoutStatus(statuses, statusSlug),
    publish: () => statusRenameKeys(req)
  })
)
