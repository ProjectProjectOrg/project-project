import { GitBranch, Plus } from "lucide-react"

import { InlineForm } from "@/components/ui/inline-form"
import { ConnectBranchFields } from "@/features/github/components/ticket-git/ConnectBranchFields"
import { CreateBranchFields } from "@/features/github/components/ticket-git/CreateBranchFields"
import { m } from "@/paraglide/messages"

import {
  ACTIONS_STACK,
  GIT_PANEL_CONTAINER,
  IDLE_STACK,
  type GitPanelFrame
} from "./gitPanelFrame"

type NoBranchAction = "create" | "connect"

export function NoBranchPanel({ frame }: Readonly<{ frame: GitPanelFrame }>) {
  const { ticket, github, branchTemplate, variant, canWrite, buttonSize } =
    frame
  const Root = InlineForm.Root<NoBranchAction>
  const baseBranch = github.defaultBaseBranch ?? "main"
  return (
    <Root
      actions={["create", "connect"]}
      key="no_branch"
      variant={variant}
      className={GIT_PANEL_CONTAINER}
    >
      <InlineForm.Idle className={IDLE_STACK}>
        <InlineForm.Display<NoBranchAction>
          previews={{
            create: (
              <span className="text-xs text-muted-foreground">
                {m.git_create_branch_preview_prefix()}{" "}
                <span className="font-mono text-foreground">{baseBranch}</span>
              </span>
            ),
            connect: (
              <span className="text-xs text-muted-foreground">
                {m.git_connect_branch_preview()}
              </span>
            )
          }}
        >
          <span className="text-xs text-muted-foreground">
            {m.git_no_branch_yet()}
          </span>
        </InlineForm.Display>
        {canWrite && (
          <InlineForm.Actions className={ACTIONS_STACK}>
            <InlineForm.Trigger
              action="create"
              size={buttonSize}
              leadingIcon={Plus}
            >
              {m.git_create_branch_button()}
            </InlineForm.Trigger>
            <InlineForm.Trigger
              action="connect"
              size={buttonSize}
              variant="tertiary"
              leadingIcon={GitBranch}
            >
              {m.git_connect_branch_button()}
            </InlineForm.Trigger>
          </InlineForm.Actions>
        )}
      </InlineForm.Idle>
      <InlineForm.Form action="create">
        <CreateBranchFields
          ticket={ticket}
          github={github}
          branchTemplate={branchTemplate}
          variant={variant}
        />
      </InlineForm.Form>
      <InlineForm.Form action="connect">
        <ConnectBranchFields
          ticket={ticket}
          github={github}
          variant={variant}
        />
      </InlineForm.Form>
    </Root>
  )
}
