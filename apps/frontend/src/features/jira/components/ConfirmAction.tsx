import type { ButtonProps } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"

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
          prompt={prompt}
          label={label}
          tone={tone}
          onConfirm={onConfirm}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
