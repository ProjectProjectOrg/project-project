import { Button } from "@pp/ui/button"
import { ButtonGroup } from "@pp/ui/button-group"
import { ChevronDown, Play } from "@pp/ui/icons"

export default function Overview() {
  return (
    <ButtonGroup>
      <Button variant="tertiary" size="sm" leadingIcon={Play}>
        Start sprint
      </Button>
      <Button variant="tertiary" size="square-7" aria-label="Schedule">
        <ChevronDown className="size-3.5" strokeWidth={1.75} />
      </Button>
    </ButtonGroup>
  )
}
