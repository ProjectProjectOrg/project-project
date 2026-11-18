import { useAtomValue } from "@effect/atom-react"
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

export type IntegrationState = Readonly<{
  tone: IntegrationTone
  label: string
  connected: boolean
  loading: boolean
}>

const disabledState = Atom.make(Result.initial())

const loadingState: IntegrationState = {
  tone: "idle",
  label: "",
  connected: false,
  loading: true
}

const notSetUp = () =>
  ({
    tone: "idle",
    label: m.org_integrations_status_not_set_up(),
    connected: false,
    loading: false
  }) satisfies IntegrationState

const attention = () =>
  ({
    tone: "attention",
    label: m.org_integrations_status_attention(),
    connected: true,
    loading: false
  }) satisfies IntegrationState

const unavailable = () =>
  ({
    tone: "attention",
    label: m.org_integrations_status_unavailable(),
    connected: false,
    loading: false
  }) satisfies IntegrationState

const connected = () =>
  ({
    tone: "connected",
    label: m.org_integrations_status_connected(),
    connected: true,
    loading: false
  }) satisfies IntegrationState

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
  if (needsStorage && !storage.loading && !storage.connected)
    return {
      tone: "attention",
      label: m.org_integrations_status_needs_storage(),
      connected: false,
      loading: false
    } satisfies IntegrationState
  return {
    tone: "idle",
    label: m.org_integrations_status_per_project(),
    connected: false,
    loading: false
  } satisfies IntegrationState
}
