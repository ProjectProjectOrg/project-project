import type { Role } from "@pp/shared"
import { Briefcase, FlaskConical, ShieldCheck, UserRound } from "@pp/ui/icons"

import type { RoleMeta } from "@/features/members/components/MemberList"
import { m } from "@/paraglide/messages"

export const ROLE_META: Readonly<Record<Role, RoleMeta>> = {
  pm: {
    label: () => m.members_role_pm(),
    icon: ShieldCheck,
    tone: "muted"
  },
  developer: {
    label: () => m.members_role_developer(),
    icon: UserRound,
    tone: "muted"
  },
  tester: {
    label: () => m.members_role_tester(),
    icon: FlaskConical,
    tone: "muted"
  },
  client: {
    label: () => m.members_role_client(),
    icon: Briefcase,
    tone: "muted"
  }
}
