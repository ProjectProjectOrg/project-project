import { Button } from "@/components/ui/button"
import { SlackAppSetup } from "@/features/slack/components/AppSetup"
import { m } from "@/paraglide/messages"

export function CreateStep({
  orgSlug,
  onNext
}: Readonly<{ orgSlug: string; onNext: () => void }>) {
  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold">{m.slack_setup_create_title()}</h3>
      <SlackAppSetup orgSlug={orgSlug} />
      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={onNext}>{m.slack_setup_continue()}</Button>
      </div>
    </div>
  )
}
