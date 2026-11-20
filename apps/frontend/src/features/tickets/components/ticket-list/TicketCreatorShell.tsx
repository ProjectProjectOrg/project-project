import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { cn } from "@pp/ui/lib/utils"
import { comboboxProps, type ListboxState } from "@pp/ui/menu-listbox"
import {
  Children,
  useId,
  type FormEvent,
  type ReactNode,
  type RefObject
} from "react"

export type TicketCreatorShellProps = Readonly<{
  inputRef: RefObject<HTMLInputElement | null>
  formRef: RefObject<HTMLFormElement | null>
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

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      data-active={expanded || undefined}
      className="relative"
    >
      <InputGroup
        focused={expanded}
        /* oxlint-disable shadcn/no-restyle -- the field's start eases in as the type chip slides in; a one-off motion */
        className={cn(
          "transition-[padding] duration-200 ease-out",
          expanded && "pl-1.25"
        )}
        /* oxlint-enable shadcn/no-restyle */
      >
        {/* One slot for every leading chip, 4px apart, so they read as a
            pair and the field's 8px gap only falls before the title. */}
        {leadingAddons.length > 0 && (
          <InputGroupAddon className="flex w-auto gap-1">
            {Children.toArray(leadingAddons)}
          </InputGroupAddon>
        )}
        <InputGroupInput
          ref={inputRef}
          {...comboboxProps(listbox)}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => {
            onKeyDown?.(e)
            if (
              e.key !== "Enter" ||
              e.defaultPrevented ||
              e.nativeEvent.isComposing
            ) {
              return
            }
            e.preventDefault()
            formRef.current?.requestSubmit()
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
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
            className="shrink-0 text-caption text-destructive"
          >
            {error}
          </span>
        ) : null}
      </InputGroup>
      {belowInput}
    </form>
  )
}
