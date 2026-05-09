import { m } from "@/paraglide/messages"

export const SCHEMA_HINTS: Record<string, () => string> = {
  BranchName: m.git_branch_name_validation_hint,
  Email: m.members_add_email_validation_hint,
  ProjectName: m.projects_name_validation_hint,
  TagName: m.tags_name_validation_hint,
  TicketTitle: m.tickets_title_validation_hint
}
