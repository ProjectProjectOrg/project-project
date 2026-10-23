import { useRender } from "@base-ui/react/use-render"
import {
  createContext,
  use,
  useId,
  useMemo,
  type ComponentProps,
  type ReactNode
} from "react"

import { SurfaceProvider } from "@/lib/surfaceContext"
import { cn } from "@/lib/utils"

type SettingsSectionProps = Readonly<{
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
}>

export function SettingsSection({
  title,
  description,
  children
}: SettingsSectionProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className="flex flex-col gap-2"
    >
      {title || description ? (
        <header className="px-0.5">
          {title ? (
            <h2 id={titleId} className="text-[13px] font-medium">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
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
        "divide-y divide-border overflow-hidden rounded-lg border border-border bg-card",
        className
      )
    }
  })
  return <SurfaceProvider value={1}>{group}</SurfaceProvider>
}

type SettingsRowIds = Readonly<{
  labelId: string
  descriptionId: string | undefined
}>

const SettingsRowContext = createContext<SettingsRowIds | null>(null)

export function useSettingsRow(): SettingsRowIds {
  const ids = use(SettingsRowContext)
  if (!ids) throw new Error("useSettingsRow must be used inside SettingsRow")
  return ids
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
      <div
        className={cn(
          "flex min-h-14 gap-x-4 gap-y-3 px-4 py-3",
          layout === "inline" ? "items-center" : "flex-col"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <p id={labelId} className="text-[13px] leading-tight font-medium">
              {label}
            </p>
            {description ? (
              <p
                id={descriptionId}
                className="mt-0.5 text-xs text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
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
