import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { m } from "@/paraglide/messages"

export function SecretReveal({
  secret,
  onDone
}: Readonly<{ secret: string; onDone: () => void }>) {
  return (
    <SettingsSection
      title={m.webhooks_secret_reveal_title()}
      description={m.webhooks_secret_reveal_description()}
    >
      <SettingsGroup>
        <SettingsRow
          label={m.webhooks_secret_label()}
          description={
            <code className="font-mono text-xs break-all text-foreground select-all">
              {secret}
            </code>
          }
        >
          <CopyButton
            value={secret}
            variant="tertiary"
            size="icon-sm"
            copyLabel={m.webhooks_secret_copy()}
            copiedLabel={m.webhooks_secret_copied()}
          />
          <Button type="button" variant="primary" size="sm" onClick={onDone}>
            {m.webhooks_secret_done()}
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
