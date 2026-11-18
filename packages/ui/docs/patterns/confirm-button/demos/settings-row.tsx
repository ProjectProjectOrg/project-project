import { ConfirmButton } from "@pp/ui/confirm-button"
import * as Effect from "effect/Effect"

// Project settings → Danger zone in the app (SettingsGroup + SettingsRow).
// The capsule covers the row's description while it is open, so the row
// keeps its height and the text doesn't rewrap.
export default function SettingsRow() {
  return (
    <div className="w-full max-w-xl divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-14 items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0">
            <p className="text-body leading-tight font-semibold">
              Delete project
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Remove this project, its tickets, and its markdown folder.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConfirmButton.Root>
            <ConfirmButton.Trigger variant="tertiary" size="sm">
              Delete project
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                cancelLabel="Cancel"
                prompt="Delete for everyone?"
                label="Delete project"
                busyLabel="Deleting…"
                describeError={() => "Couldn't delete the project."}
                onConfirm={() =>
                  Effect.runPromise(
                    Effect.sleep("1200 millis").pipe(Effect.as(true))
                  )
                }
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </div>
      </div>
    </div>
  )
}
