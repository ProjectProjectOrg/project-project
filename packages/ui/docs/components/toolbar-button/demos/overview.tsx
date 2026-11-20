import { ListFilter } from "@pp/ui/icons"
import { ToolbarButton, ToolbarClearButton } from "@pp/ui/toolbar-button"

export default function Overview() {
  return (
    <div className="flex gap-2">
      <ToolbarButton>
        <ListFilter className="size-4" strokeWidth={1.75} />
        Filters
      </ToolbarButton>
      <div className="group/toolbar relative flex">
        <ToolbarButton active className="pr-10">
          <ListFilter className="size-4" strokeWidth={1.75} />
          Filters
        </ToolbarButton>
        <ToolbarClearButton label="Clear filters" onClick={() => {}} />
      </div>
    </div>
  )
}
