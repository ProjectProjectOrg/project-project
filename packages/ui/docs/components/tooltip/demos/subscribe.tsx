import { Button } from "@pp/ui/button"
import { Bell } from "@pp/ui/icons"
import { TextSwap } from "@pp/ui/text-swap"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import { useState } from "react"

// The ticket page's Subscribe toggle. Its label rolls between Subscribe and
// Subscribed (TextSwap, which also eases the width). The button says what
// you'll do; the tooltip says who already gets updates, so it adds to the
// label and the button is described by it (aria-describedby).
export default function Subscribe() {
  const [subscribed, setSubscribed] = useState(false)
  const names = subscribed ? ["you", "Sam", "Robin"] : ["Sam", "Robin"]

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-pressed={subscribed}
            onClick={() => setSubscribed(!subscribed)}
          />
        }
      >
        <Bell className="size-3.5" strokeWidth={1.75} />
        <TextSwap>{subscribed ? "Subscribed" : "Subscribe"}</TextSwap>
      </TooltipTrigger>
      <TooltipContent>
        Subscribed: {new Intl.ListFormat("en").format(names)}
      </TooltipContent>
    </Tooltip>
  )
}
