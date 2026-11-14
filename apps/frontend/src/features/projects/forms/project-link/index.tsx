import type { ProjectLink } from "@pp/shared"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { projectLinkFormOpts, toProjectLink } from "./opts"

export function ProjectLinkForm({
  initial,
  error,
  onSave,
  onRemove
}: Readonly<{
  initial?: ProjectLink
  error: string | null
  onSave: (link: ProjectLink) => Promise<void>
  onRemove?: () => Promise<void>
}>) {
  const urlId = useId()
  const labelId = useId()
  const errorId = useId()
  const form = useAppForm({
    ...projectLinkFormOpts(initial),
    onSubmit: async ({ value }) => {
      const link = toProjectLink(value)
      if (link !== null) await onSave(link)
    }
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="label">
        {(field) => (
          <>
            <label
              htmlFor={labelId}
              className="text-caption text-muted-foreground"
            >
              {m.project_links_label_label()}
            </label>
            <Input
              id={labelId}
              variant="popover"
              placeholder={m.project_links_label_placeholder()}
              value={field.value}
              maxLength={80}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          </>
        )}
      </form.Field>
      <form.Field name="url">
        {(field) => (
          <>
            <label
              htmlFor={urlId}
              className="mt-1 text-caption text-muted-foreground"
            >
              {m.project_links_url_label()}
            </label>
            <Input
              id={urlId}
              type="url"
              inputMode="url"
              variant="popover"
              placeholder={m.project_links_url_placeholder()}
              value={field.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.errors.length > 0}
              aria-describedby={field.errors.length > 0 ? errorId : undefined}
            />
            {field.errors.length > 0 ? (
              <p
                id={errorId}
                role="alert"
                className="text-caption text-destructive"
              >
                {m.project_links_url_invalid()}
              </p>
            ) : null}
          </>
        )}
      </form.Field>
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-1">
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onRemove()}
          >
            {m.project_links_remove_button()}
          </Button>
        ) : null}
        <Button type="submit" size="sm">
          {initial === undefined
            ? m.project_links_add_button()
            : m.project_links_save_button()}
          <Kbd
            aria-hidden
            size="sm"
            className="bg-background/15 text-background"
          >
            ↵
          </Kbd>
        </Button>
      </div>
    </form>
  )
}
