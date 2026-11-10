import { EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { m } from "@/paraglide/messages"

export function HiddenColumnsEmpty({
  onShowAll
}: Readonly<{ onShowAll: () => void }>) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <EyeOff strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.sprints_board_all_hidden_title()}</EmptyTitle>
        <EmptyDescription>
          {m.sprints_board_all_hidden_description()}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="secondary" size="sm" onClick={onShowAll}>
          {m.sprints_board_all_hidden_show_all()}
        </Button>
      </EmptyContent>
    </Empty>
  )
}
