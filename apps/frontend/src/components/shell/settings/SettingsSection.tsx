import { useRender } from "@base-ui/react/use-render"
import { cn } from "@pp/ui/lib/utils"
import {
  createContext,
  use,
  useId,
  useMemo,
  type ComponentProps,
  type MouseEvent,
  type ReactNode
} from "react"

type SettingsSectionProps = Readonly<{
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}>

export function SettingsSection({
  title,
  description,
  action,
  children
}: SettingsSectionProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className="flex flex-col gap-2"
    >
      {title || description || action ? (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-0.5">
          <div className="min-w-0 flex-1 basis-40">
            {title ? (
              <h2 id={titleId} className="text-body font-semibold">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-caption text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function SettingsGroup({
  className,
  render,
  ...props
}: ComponentProps<"div"> & { render?: useRender.RenderProp }) {
  const group = useRender({
    defaultTagName: "div",
    render,
    props: {
      ...props,
      className: cn(
        "tertiary-tiles divide-y divide-border overflow-hidden rounded-lg border border-border surface-card",
        className
      )
    }
  })
  return group
}

type SettingsRowIds = Readonly<{
  labelId: string
  descriptionId: string | undefined
}>

const SettingsRowContext = createContext<SettingsRowIds | null>(null)

export function useSettingsRow() {
  const ids = use(SettingsRowContext)
  if (!ids) throw new Error("useSettingsRow must be used inside SettingsRow")
  return ids
}

// A row holding a switch toggles it from anywhere on the row: the whole row
// is the hit area, with a hover fill to show it. Clicks on other controls in
// the row (buttons, links, fields) keep their own behaviour.
const ROW_SWITCH_CLASS =
  "transition-colors has-[[data-slot=switch]:not([data-disabled],[data-loading])]:cursor-pointer has-[[data-slot=switch]:not([data-disabled],[data-loading])]:hover:surface-lit has-[[data-slot=switch]]:select-none"

const ROW_CONTROLS =
  "button, a, input, textarea, select, label, [role=switch], [role=button], [role=combobox], [role=menuitem], [role=tab]"

function toggleRowSwitch(event: MouseEvent<HTMLDivElement>) {
  if (event.target instanceof Element && event.target.closest(ROW_CONTROLS))
    return
  event.currentTarget
    .querySelector<HTMLElement>('[data-slot="switch"]')
    ?.click()
}

type SettingsRowProps = Readonly<{
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  error?: ReactNode
  layout?: "inline" | "stacked"
  children?: ReactNode
}>

export function SettingsRow({
  label,
  description,
  icon,
  error,
  layout = "inline",
  children
}: SettingsRowProps) {
  const labelId = useId()
  const descriptionId = useId()
  const hasDescription = Boolean(description)
  const ids = useMemo(
    () => ({
      labelId,
      descriptionId: hasDescription ? descriptionId : undefined
    }),
    [labelId, descriptionId, hasDescription]
  )

  return (
    <SettingsRowContext value={ids}>
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a pointer shortcut only: keyboard users reach the switch itself */}
      <div
        onClick={toggleRowSwitch}
        className={cn(
          "flex min-h-14 gap-x-4 gap-y-3 px-4 py-3",
          layout === "inline" ? "items-center" : "flex-col",
          ROW_SWITCH_CLASS
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <p id={labelId} className="text-body leading-tight font-semibold">
              {label}
            </p>
            {description ? (
              <p
                id={descriptionId}
                className="mt-0.5 text-caption text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-1 text-caption text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        {children ? (
          <div
            className={cn(
              "flex items-center gap-2",
              layout === "inline" && "shrink-0"
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    </SettingsRowContext>
  )
}
