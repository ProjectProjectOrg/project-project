import { Button } from "@pp/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import { Bell } from "lucide-react"
import { useState } from "react"

// The ticket page's Subscribe toggle. The button says what you'll do; the
// tooltip says who already gets updates, so it adds to the label and the
// button is described by it (aria-describedby).
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
        {subscribed ? "Subscribed" : "Subscribe"}
      </TooltipTrigger>
      <TooltipContent>
        Subscribed: {new Intl.ListFormat("en").format(names)}
      </TooltipContent>
    </Tooltip>
  )
}
