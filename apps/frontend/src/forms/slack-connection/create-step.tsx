import { SlackAppSetup } from "@/features/slack/components/AppSetup"
import { m } from "@/paraglide/messages"

import { SetupStep, type StepFrame } from "./setup-step"

export function CreateStep({
  frame,
  orgSlug,
  onNext
}: Readonly<{ frame: StepFrame; orgSlug: string; onNext: () => void }>) {
  return (
    <SetupStep
      frame={frame}
      title={m.slack_setup_create_title()}
      description={m.slack_setup_instructions()}
      onBack={undefined}
      onSubmit={onNext}
    >
      <SlackAppSetup orgSlug={orgSlug} includeCreate />
    </SetupStep>
  )
}
