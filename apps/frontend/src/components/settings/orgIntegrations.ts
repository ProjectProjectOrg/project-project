import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import type { IntegrationTone } from "@/components/settings/IntegrationDetail"
import {
  githubIntegration,
  githubOrgRequest
} from "@/features/github/atoms/github"
import { emailRequest, orgEmail } from "@/features/organizations/atoms/email"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { m } from "@/paraglide/messages"

export type IntegrationState = Readonly<{
  tone: IntegrationTone
  label: string
  connected: boolean
  loading: boolean
}>

const loadingState: IntegrationState = {
  tone: "idle",
  label: "",
  connected: false,
  loading: true
}

const notSetUp = (): IntegrationState => ({
  tone: "idle",
  label: m.org_integrations_status_not_set_up(),
  connected: false,
  loading: false
})

const attention = (): IntegrationState => ({
  tone: "attention",
  label: m.org_integrations_status_attention(),
  connected: true,
  loading: false
})

const connected = (label: string): IntegrationState => ({
  tone: "connected",
  label,
  connected: true,
  loading: false
})

export function useGithubAppState(orgSlug: string): IntegrationState {
  const result = useAtomValue(githubIntegration(githubOrgRequest(orgSlug)))
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return attention()
  const { status, accountLogin } = result.value
  if (status === "active")
    return connected(
      accountLogin
        ? `${m.org_integrations_status_connected()} · ${accountLogin}`
        : m.org_integrations_status_connected()
    )
  return status === "broken" ? attention() : notSetUp()
}

export function useStorageState(orgSlug: string): IntegrationState {
  const result = useAtomValue(orgStorage(storageRequest(orgSlug)))
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return attention()
  const { status, bucket } = result.value
  if (status === "active")
    return connected(
      bucket
        ? `${m.org_integrations_status_connected()} · ${bucket}`
        : m.org_integrations_status_connected()
    )
  return status === "broken" ? attention() : notSetUp()
}

export function useEmailState(orgSlug: string): IntegrationState {
  const result = useAtomValue(orgEmail(emailRequest(orgSlug)))
  if (Result.isInitial(result)) return loadingState
  if (!Result.isSuccess(result)) return attention()
  const { settings, lastTest } = result.value
  if (!settings) return notSetUp()
  if (lastTest?.error) return attention()
  return connected(
    `${m.org_integrations_status_connected()} · ${settings.senderEmail}`
  )
}

export function perProjectState(
  needsStorage: boolean,
  storage: IntegrationState
): IntegrationState {
  if (needsStorage && !storage.loading && !storage.connected)
    return {
      tone: "attention",
      label: m.org_integrations_status_needs_storage(),
      connected: false,
      loading: false
    }
  return {
    tone: "idle",
    label: m.org_integrations_status_per_project(),
    connected: false,
    loading: false
  }
}
