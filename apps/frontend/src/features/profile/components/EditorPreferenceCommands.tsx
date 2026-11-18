import { useAtomValue } from "@effect/atom-react"
import { CommandMenuCheck, CommandMenuItem } from "@pp/ui/command-menu"
import { cn } from "@pp/ui/lib/utils"
import * as Result from "effect/reactivity/AsyncResult"

import { fireMutation } from "@/api/viewMutation"
import { me, updateEditorPreference } from "@/features/auth/atoms/auth"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { EDITOR_OPTIONS } from "@/features/profile/lib/editorOptions"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function EditorPreferenceCommands({
  chip,
  onBack,
  env
}: CommandPageProps) {
  const viewer = useAtomValue(me())
  const mutation = useAtomValue(updateEditorPreference)
  const current = Result.isSuccess(viewer)
    ? viewer.value.editorPreference
    : null
  const error = mutationErrorText(
    mutation,
    m.profile_editor_update_error,
    m.profile_editor_update_error
  )
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.profile_command_editor_placeholder()}
      onBack={onBack}
      notice={
        error ??
        (Result.isFailure(viewer)
          ? m.profile_command_editor_load_error()
          : null)
      }
      items={EDITOR_OPTIONS.map((option) => ({
        value: option.key,
        label: option.label(),
        disabled: current === null || mutation.waiting
      }))}
      onSelect={(item) => {
        const option = EDITOR_OPTIONS.find(
          (candidate) => candidate.key === item.value
        )
        if (option === undefined || mutation.waiting || current === null) return
        if (option.key === current) {
          env.close()
          return
        }
        void fireMutation(
          env.registry,
          updateEditorPreference,
          option.key
        ).then((result) => {
          if (Result.isSuccess(result)) env.close()
        })
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              mutation.waiting && "animate-pulse"
            )}
          >
            {item.label}
          </span>
          <CommandMenuCheck
            checked={current === item.value}
            label={m.chrome_command_menu_selected()}
          />
        </CommandMenuItem>
      )}
    />
  )
}
