import { useAtomValue } from "@effect/atom-react"
import * as Data from "effect/Data"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  githubIntegration,
  githubOrgRequest
} from "@/features/github/atoms/github"
import type { IntegrationTone } from "@/features/integrations/components/IntegrationDetail"
import { emailRequest, orgEmail } from "@/features/organizations/atoms/email"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { slackOrg, slackOrgRequest } from "@/features/slack/atoms/slack"
import { m } from "@/paraglide/messages"

type Status = Readonly<{
  tone: IntegrationTone
  label: string
}>

export type IntegrationState = Data.TaggedEnum<{
  loading: Status
  notSetUp: Status
  unavailable: Status
  attention: Status
  connected: Status
  needsStorage: Status
  perProject: Status
}>
export const IntegrationState = Data.taggedEnum<IntegrationState>()

const disabledState = Atom.make(Result.initial())

const loadingState = IntegrationState.loading({ tone: "idle", label: "" })

const notSetUp = () =>
  IntegrationState.notSetUp({
    tone: "idle",
    label: m.org_integrations_status_not_set_up()
  })

const attention = () =>
  IntegrationState.attention({
    tone: "attention",
    label: m.org_integrations_status_attention()
  })

const unavailable = () =>
  IntegrationState.unavailable({
    tone: "attention",
    label: m.org_integrations_status_unavailable()
  })

const connected = () =>
  IntegrationState.connected({
    tone: "connected",
    label: m.org_integrations_status_connected()
  })

export function useGithubAppState(orgSlug: string, enabled = true) {
  const result = useAtomValue(
    enabled ? githubIntegration(githubOrgRequest(orgSlug)) : disabledState
  )
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return unavailable()
  const { status } = result.value
  if (status === "active") return connected()
  return status === "broken" ? attention() : notSetUp()
}

export function useStorageState(orgSlug: string, enabled = true) {
  const result = useAtomValue(
    enabled ? orgStorage(storageRequest(orgSlug)) : disabledState
  )
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return unavailable()
  const { status } = result.value
  if (status === "active") return connected()
  return status === "broken" ? attention() : notSetUp()
}

export function useEmailState(orgSlug: string, enabled = true) {
  const result = useAtomValue(
    enabled ? orgEmail(emailRequest(orgSlug)) : disabledState
  )
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return unavailable()
  const { settings, lastTest } = result.value
  if (!settings) return notSetUp()
  if (lastTest?.error) return attention()
  return connected()
}

export function useSlackState(orgSlug: string, enabled = true) {
  const result = useAtomValue(
    enabled ? slackOrg(slackOrgRequest(orgSlug)) : disabledState
  )
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return unavailable()
  const { connection } = result.value
  if (!connection) return notSetUp()
  return connection.lastError ? attention() : connected()
}

export function perProjectState(
  needsStorage: boolean,
  storage: IntegrationState
) {
  const settled =
    IntegrationState.$is("loading")(storage) ||
    IntegrationState.$is("connected")(storage) ||
    IntegrationState.$is("attention")(storage)
  if (needsStorage && !settled)
    return IntegrationState.needsStorage({
      tone: "attention",
      label: m.org_integrations_status_needs_storage()
    })
  return IntegrationState.perProject({
    tone: "idle",
    label: m.org_integrations_status_per_project()
  })
}
