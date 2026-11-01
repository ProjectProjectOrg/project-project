import { useAtomSet } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  deleteWebhook,
  type WebhooksRequest
} from "@/features/webhooks/atoms/webhooks"
import { m } from "@/paraglide/messages"

type Target = Readonly<{ req: WebhooksRequest; id: string }>

export function DeleteWebhookSection({ target }: Readonly<{ target: Target }>) {
  const remove = useAtomSet(deleteWebhook(target), { mode: "promiseExit" })
  const navigate = useNavigate()
  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={m.webhooks_delete()}
          description={m.webhooks_delete_description()}
        >
          <ConfirmButton.Root>
            <ConfirmButton.Trigger variant="tertiary" size="sm">
              {m.webhooks_delete()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.webhooks_delete_confirm()}
                label={m.common_delete_confirm_button()}
                busyLabel={m.common_deleting_button()}
                onConfirm={async () => {
                  const exit = await remove()
                  if (Exit.isSuccess(exit))
                    void navigate({
                      to: "/orgs/$orgSlug/projects/$slug/settings/webhooks",
                      params: target.req.params
                    })
                  return exit
                }}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
