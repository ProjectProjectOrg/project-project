import { Button } from "@pp/ui/button"
import { Plus } from "@pp/ui/icons"

const sprints = ["Sprint 14", "Sprint 13", "Sprint 12"]

export default function NewSprint() {
  return (
    <div className="flex w-60 flex-col gap-0.5 rounded-[20px] surface-background p-2 corner-squircle">
      {sprints.map((name) => (
        <p key={name} className="px-2 py-1.5 text-body text-muted-foreground">
          {name}
        </p>
      ))}
      <Button
        type="button"
        variant="dither"
        className="mt-1 w-full justify-start text-primary-foreground"
        leadingIcon={Plus}
        ditherFrom="var(--primary)"
        ditherTo="var(--background)"
        ditherDirection="r"
        ditherStops={[0.7, 1]}
        ditherHoverStops={[0.5, 1]}
      >
        New sprint
      </Button>
    </div>
  )
}
