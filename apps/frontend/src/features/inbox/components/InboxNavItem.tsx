import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { Inbox } from "lucide-react"

import { NavItem } from "@/components/shell/NavItem"
import { CountPill } from "@/components/ui/count-pill"
import { inboxUnread, inboxUnreadRequest } from "@/features/inbox/atoms/inbox"
import { useInboxSync } from "@/features/inbox/hooks/useInboxSync"
import { m } from "@/paraglide/messages"

export function InboxNavItem({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const req = inboxUnreadRequest(orgSlug)
  const result = useAtomValue(inboxUnread(req))
  useInboxSync(false)
  const count = Result.isSuccess(result) ? result.value.count : 0
  return (
    <NavItem
      to="/orgs/$orgSlug/inbox"
      params={{ orgSlug }}
      icon={Inbox}
      label={m.chrome_sidebar_inbox()}
      accessibleLabel={
        count > 0 ? m.chrome_sidebar_inbox_unread({ count }) : undefined
      }
      trailing={count > 0 ? <CountPill active>{count}</CountPill> : undefined}
      index={1}
    />
  )
}
