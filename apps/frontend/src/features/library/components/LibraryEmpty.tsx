import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { LibraryBig } from "lucide-react"

export function LibraryEmpty({
  caption,
  hint
}: Readonly<{ caption: string; hint: string }>) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LibraryBig strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{caption}</EmptyTitle>
        <EmptyDescription>{hint}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
