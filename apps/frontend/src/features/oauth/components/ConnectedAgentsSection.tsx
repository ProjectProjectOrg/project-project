import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { OAuthApplication } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { KeyRound } from "lucide-react"
import { useMemo, useState } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { SettingsDisclosureItem } from "@/components/shell/settings/SettingsDisclosureItem"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { CodeSnippet } from "@/components/ui/code-snippet"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  type OAuthApplicationsRequest,
  oauthApplicationsRequest,
  oauthApplicationsAtom,
  revokeOAuthApplicationAtom
} from "@/features/oauth/atoms/oauthApplications"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export function ConnectedAgentsSection() {
  const req = oauthApplicationsRequest()
  const applicationsAtom = oauthApplicationsAtom(req)
  const applications = useAtomValue(applicationsAtom)
  const refresh = useAtomRefresh(applicationsAtom)

  return (
    <>
      <SettingsSection>
        {Result.matchWithError(applications, {
          onInitial: () => <SettingsSkeleton rows={2} />,
          onError: (error) => (
            <ErrorPage error={error} reset={refresh} contained />
          ),
          onDefect: (defect) => (
            <ErrorPage error={defect} reset={refresh} contained />
          ),
          onSuccess: ({ value, waiting }) => (
            <SettingsGroup
              className={cn(
                waiting && "animate-pulse motion-reduce:animate-none"
              )}
            >
              {value.length === 0 ? (
                <SettingsRow
                  label={
                    <span className="font-normal text-muted-foreground">
                      {m.profile_connected_agents_empty()}
                    </span>
                  }
                />
              ) : (
                value.map((app) => (
                  <AgentRow key={app.id} app={app} req={req} />
                ))
              )}
            </SettingsGroup>
          )
        })}
      </SettingsSection>
      <ConnectMcpDisclosure />
    </>
  )
}

function AgentRow({
  app,
  req
}: {
  app: OAuthApplication
  req: OAuthApplicationsRequest
}) {
  const locale = getLocale()
  const revoke = useAtomSet(revokeOAuthApplicationAtom({ req, id: app.id }))
  return (
    <SettingsRow
      icon={
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-border text-muted-foreground">
          <KeyRound className="size-4" strokeWidth={1.75} />
        </span>
      }
      label={app.name}
      description={
        <>
          <span className="font-mono">{app.clientId}</span>
          <span className="mx-1.5">·</span>
          {m.profile_connected_agents_connected_at({
            date: app.createdAt.toLocaleDateString(locale)
          })}
          <span className="mx-1.5">·</span>
          {app.lastUsedAt
            ? m.profile_connected_agents_last_used_at({
                date: app.lastUsedAt.toLocaleDateString(locale)
              })
            : m.profile_connected_agents_never_used()}
        </>
      }
    >
      <ConfirmButton.Root>
        <ConfirmButton.Trigger variant="tertiary" size="sm">
          {m.profile_connected_agents_revoke()}
        </ConfirmButton.Trigger>
        <ConfirmButton.Confirm>
          <ConfirmButton.Action
            prompt={m.profile_connected_agents_revoke_confirm()}
            label={m.profile_connected_agents_revoke()}
            onConfirm={() => {
              revoke()
            }}
          />
        </ConfirmButton.Confirm>
      </ConfirmButton.Root>
    </SettingsRow>
  )
}

type McpProvider = {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly revision: string
  readonly language: "bash" | "json"
  readonly buildSnippet: (mcpUrl: string) => string
}

function ConnectMcpDisclosure() {
  const mcpUrl =
    typeof window === "undefined"
      ? "https://your-instance.example.com/mcp"
      : `${window.location.origin}/mcp`
  const providers: ReadonlyArray<McpProvider> = [
    {
      id: "claude",
      label: m.profile_connect_mcp_claude_label(),
      description: m.profile_connect_mcp_claude_description(),
      revision: "2026-07-28",
      language: "bash",
      buildSnippet: (url) =>
        `claude mcp add --transport http projectproject ${url}`
    },
    {
      id: "codex",
      label: m.profile_connect_mcp_codex_label(),
      description: m.profile_connect_mcp_codex_description(),
      revision: "2026-07-28",
      language: "bash",
      buildSnippet: (url) => `codex mcp add projectproject --url ${url}`
    },
    {
      id: "cursor",
      label: m.profile_connect_mcp_cursor_label(),
      description: m.profile_connect_mcp_cursor_description(),
      revision: "2025-11-25",
      language: "json",
      buildSnippet: (url) =>
        JSON.stringify({ mcpServers: { projectproject: { url } } }, null, 2)
    },
    {
      id: "gemini",
      label: m.profile_connect_mcp_gemini_label(),
      description: m.profile_connect_mcp_gemini_description(),
      revision: "2025-06-18",
      language: "bash",
      buildSnippet: (url) =>
        `gemini mcp add --transport http projectproject ${url}`
    }
  ]
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <SettingsSection title={m.profile_connect_mcp_title()}>
      <SettingsGroup>
        {providers.map((provider) => (
          <ProviderItem
            key={provider.id}
            provider={provider}
            mcpUrl={mcpUrl}
            open={openId === provider.id}
            onToggle={() =>
              setOpenId((current) =>
                current === provider.id ? null : provider.id
              )
            }
          />
        ))}
      </SettingsGroup>
      <p className="px-0.5 text-xs text-muted-foreground">
        {m.profile_connect_mcp_caveat()}
      </p>
    </SettingsSection>
  )
}

function ProviderItem({
  provider,
  mcpUrl,
  open,
  onToggle
}: {
  provider: McpProvider
  mcpUrl: string
  open: boolean
  onToggle: () => void
}) {
  const snippet = useMemo(
    () => provider.buildSnippet(mcpUrl),
    [provider, mcpUrl]
  )
  return (
    <SettingsDisclosureItem
      label={provider.label}
      open={open}
      onToggle={onToggle}
    >
      <p className="text-xs text-muted-foreground">{provider.description}</p>
      <p className="text-[11px] text-muted-foreground">
        {m.profile_connect_mcp_revision({ revision: provider.revision })}
      </p>
      <CodeSnippet code={snippet} language={provider.language} />
    </SettingsDisclosureItem>
  )
}
