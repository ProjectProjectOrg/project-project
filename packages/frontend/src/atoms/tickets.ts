import { Atom } from "@effect-atom/atom-react"
import { Schema } from "effect"
import { AppApiClient } from "@/services/AppApiClient"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import { TicketId } from "@projectproject/shared"

export const ticketsListKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

export const ticketKey = (orgSlug: string, slug: string, id: TicketId) =>
  `${orgSlug}/${slug}/${id}`

const splitProjectKey = (key: string) => {
  const idx = key.indexOf("/")
  return { orgSlug: key.slice(0, idx), slug: key.slice(idx + 1) }
}

const makeTicketId = Schema.decodeUnknownSync(TicketId)

const splitTicketKey = (key: string) => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    id: makeTicketId(parts.slice(2).join("/"))
  }
}

export const ticketsListAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return AppApiClient.query("tickets", "list", {
    path: { orgSlug, slug },
    reactivityKeys: [ReactivityKey.tickets]
  })
})

export const ticketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return AppApiClient.query("tickets", "get", {
    path: { orgSlug, slug, id },
    reactivityKeys: [ReactivityKey.tickets]
  })
})

export const createTicketAtom = AppApiClient.mutation("tickets", "create")

export const updateTicketAtom = AppApiClient.mutation("tickets", "update")

export const deleteTicketAtom = AppApiClient.mutation("tickets", "delete")
