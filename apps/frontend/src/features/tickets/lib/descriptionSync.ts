import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"

import { isValidationDetail } from "@/lib/errorMessage"

export type RemoteBodyInput = Readonly<{
  incoming: string
  base: string
  sent: string | null
  current: string | null
  idle: boolean
}>

export type RemoteBodyAction = "none" | "adopt" | "reload" | "notify"

const sameMarkdown = (a: string, b: string): boolean => a.trim() === b.trim()

export const remoteBodyAction = ({
  incoming,
  base,
  sent,
  current,
  idle
}: RemoteBodyInput): RemoteBodyAction => {
  if (incoming === base) return "none"
  if (sent !== null && incoming === sent) return "none"
  if (current !== null && sameMarkdown(incoming, current))
    return sent === null ? "adopt" : "none"
  return idle ? "reload" : "notify"
}

export const isDescriptionConflict = <A, E>(exit: Exit.Exit<A, E>): boolean => {
  if (Exit.isSuccess(exit)) return false
  const error = Cause.squash(exit.cause)
  return isValidationDetail(error) && error.reason === "ticket_body_changed"
}
