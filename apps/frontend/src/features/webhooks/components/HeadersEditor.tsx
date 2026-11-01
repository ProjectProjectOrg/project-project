import type { WebhookHeader } from "@pp/shared"
import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { m } from "@/paraglide/messages"

type HeadersEditorProps = Readonly<{
  headers: ReadonlyArray<WebhookHeader>
  onChange: (headers: ReadonlyArray<WebhookHeader>) => void
  disabled?: boolean
}>

export function HeadersEditor({
  headers,
  onChange,
  disabled = false
}: HeadersEditorProps) {
  const update = (index: number, patch: Partial<WebhookHeader>) =>
    onChange(
      headers.map((header, at) =>
        at === index ? { ...header, ...patch } : header
      )
    )
  return (
    <div className="flex w-full flex-col gap-2">
      {headers.map((header, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={m.webhooks_header_name()}
            placeholder={m.webhooks_header_name_placeholder()}
            value={header.name}
            disabled={disabled}
            autoComplete="off"
            className="w-48 font-mono text-[13px]"
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Input
            aria-label={m.webhooks_header_value()}
            placeholder={m.webhooks_header_value_placeholder()}
            value={header.value}
            disabled={disabled}
            autoComplete="off"
            className="min-w-0 flex-1 font-mono text-[13px]"
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Button
            type="button"
            variant="quiet"
            size="square-8"
            aria-label={m.webhooks_header_remove()}
            disabled={disabled}
            onClick={() => onChange(headers.filter((_, at) => at !== index))}
          >
            <X strokeWidth={1.75} />
          </Button>
        </div>
      ))}
      {headers.length < 10 ? (
        <div>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange([...headers, { name: "", value: "" }])}
          >
            <Plus strokeWidth={1.75} />
            {m.webhooks_header_add()}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
