import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { CopyButton } from "@/components/ui/copy-button"
import { m } from "@/paraglide/messages"

import { instanceHealth } from "../atoms/instance"
import { displayVersion } from "../lib/displayVersion"

export function InstanceInfo() {
  const health = useAtomValue(instanceHealth)
  const host = window.location.host
  const version = AsyncResult.isSuccess(health) ? health.value.version : null

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate">{host}</div>
        {version ? (
          <div className="truncate font-mono" title={version}>
            {displayVersion(version)}
          </div>
        ) : null}
      </div>
      {version ? (
        <CopyButton
          value={`${host} ${version}`}
          copyLabel={m.chrome_user_menu_copy_version()}
          copiedLabel={m.chrome_user_menu_version_copied()}
          className="text-muted-foreground"
          iconClassName="size-3.5"
        />
      ) : null}
    </div>
  )
}
