import type { ButtonProps } from "@pp/ui/button"
import { ConfirmButton } from "@pp/ui/confirm-button"

import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function ConfirmAction({
  trigger,
  prompt,
  label,
  variant = "tertiary",
  bleed,
  tone,
  disabled,
  onConfirm
}: Readonly<{
  trigger: string
  prompt: string
  label: string
  variant?: ButtonProps["variant"]
  bleed?: ButtonProps["bleed"]
  tone?: "destructive" | "neutral"
  disabled?: boolean
  onConfirm: () => Promise<boolean>
}>) {
  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger
        variant={variant}
        bleed={bleed}
        disabled={disabled}
      >
        {trigger}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm>
        <ConfirmButton.Action
          cancelLabel={m.common_cancel_button()}
          describeError={describeCause}
          prompt={prompt}
          label={label}
          tone={tone}
          onConfirm={onConfirm}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
