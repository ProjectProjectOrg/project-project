import { useAtomValue } from "@effect/atom-react"
import { Download, ExternalLink } from "lucide-react"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsDisclosureItem } from "@/components/shell/settings/SettingsDisclosureItem"
import {
  SettingsGroup,
  SettingsRow
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

import { slackManifest, slackOrgRequest } from "../atoms/slack"

export function SlackAppSetup({
  orgSlug,
  includeCreate
}: Readonly<{ orgSlug: string; includeCreate: boolean }>) {
  const result = useAtomValue(slackManifest(slackOrgRequest(orgSlug)))
  const [manifestOpen, setManifestOpen] = useState(false)
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => <SettingsSkeleton rows={includeCreate ? 4 : 3} />}
      onSuccess={({ value }) => (
        <SettingsGroup>
          {includeCreate ? (
            <SettingsRow
              label={m.slack_create_app()}
              description={m.slack_setup_create_body()}
            >
              <Button
                size="sm"
                trailingIcon={ExternalLink}
                render={
                  <a href={value.createUrl} target="_blank" rel="noreferrer" />
                }
              >
                {m.slack_create_app()}
              </Button>
            </SettingsRow>
          ) : null}
          <SettingsRow
            layout="stacked"
            label={m.slack_callback_label()}
            description={m.slack_callback_hint()}
          >
            <code className="block w-full rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs break-all text-muted-foreground">
              {value.redirectUri}
            </code>
          </SettingsRow>
          <SettingsRow
            label={m.slack_app_icon_label()}
            description={m.slack_icon_instructions()}
          >
            <Button
              variant="tertiary"
              size="sm"
              leadingIcon={Download}
              render={
                <a
                  href="/icon/icon-512.png"
                  download="projectproject-slack.png"
                />
              }
            >
              {m.slack_download_icon()}
            </Button>
          </SettingsRow>
          <SettingsRow
            layout="stacked"
            label={m.slack_guides_label()}
            description={m.slack_host_notice()}
          >
            <Button
              variant="tertiary"
              size="sm"
              trailingIcon={ExternalLink}
              render={
                <a
                  href="https://docs.slack.dev/tools/bolt-python/creating-an-app/"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              {m.slack_setup_docs()}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              trailingIcon={ExternalLink}
              render={
                <a
                  href="https://docs.slack.dev/authentication/sign-in-with-slack/"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              {m.slack_setup_oauth_docs()}
            </Button>
          </SettingsRow>
          <SettingsDisclosureItem
            label={m.slack_manifest_label()}
            open={manifestOpen}
            onToggle={() => setManifestOpen((open) => !open)}
          >
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {value.manifest}
            </pre>
          </SettingsDisclosureItem>
        </SettingsGroup>
      )}
    />
  )
}
