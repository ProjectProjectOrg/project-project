import { useId, type FormEvent, type ReactNode, type RefObject } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { comboboxProps, type ListboxState } from "@/components/ui/menu-listbox"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { cn } from "@/lib/utils"

export type TicketCreatorShellProps = Readonly<{
  inputRef: RefObject<HTMLInputElement | null>
  formRef: RefObject<HTMLFormElement | null>
  shortcut: string
  value: string
  onValueChange: (next: string) => void
  onPointerEnter?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  expanded: boolean
  placeholder: string
  ariaLabel: string
  busy?: boolean
  maxLength?: number
  error?: string | null
  listbox: ListboxState | null
  leadingAddons: ReadonlyArray<ReactNode>
  belowInput?: ReactNode
}>

export function TicketCreatorShell({
  inputRef,
  formRef,
  shortcut,
  value,
  onValueChange,
  onPointerEnter,
  onFocus,
  onBlur,
  onKeyDown,
  onSubmit,
  expanded,
  placeholder,
  ariaLabel,
  busy = false,
  maxLength,
  error,
  listbox,
  leadingAddons,
  belowInput
}: TicketCreatorShellProps) {
  const errorId = useId()
  useGlobalShortcut(shortcut, inputRef)

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      data-active={expanded || undefined}
      className="relative"
    >
      <InputGroup
        className={cn(
          "transition-[padding] duration-200 ease-out",
          expanded && "pl-[5px]"
        )}
      >
        {leadingAddons.map((addon, i) => (
          <InputGroupAddon key={i} className="w-auto">
            {addon}
          </InputGroupAddon>
        ))}
        <InputGroupInput
          ref={inputRef}
          {...comboboxProps(listbox)}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-keyshortcuts={shortcut}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          readOnly={busy}
          aria-disabled={busy || undefined}
          maxLength={maxLength}
          className="read-only:cursor-wait"
        />
        {error ? (
          <span
            id={errorId}
            role="alert"
            className="shrink-0 text-xs text-destructive"
          >
            {error}
          </span>
        ) : (
          !expanded && <Kbd aria-hidden>{shortcut}</Kbd>
        )}
      </InputGroup>
      {belowInput}
    </form>
  )
}
