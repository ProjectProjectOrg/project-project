import securityTokensImage from "@/assets/figma-walkthrough/figma-security-tokens.png"
import devScopesImage from "@/assets/figma-walkthrough/figma-token-dev-scopes.png"
import scopesImage from "@/assets/figma-walkthrough/figma-token-scopes.png"
import { IntegrationWalkthrough } from "@/components/shell/IntegrationWalkthrough"
import { m } from "@/paraglide/messages"

export function FigmaTokenWalkthrough() {
  const slides = [
    {
      image: securityTokensImage,
      title: m.figma_project_help_step_security_title(),
      body: m.figma_project_help_step_security_body(),
      alt: m.figma_project_help_step_security_alt()
    },
    {
      image: scopesImage,
      title: m.figma_project_help_step_scopes_title(),
      body: m.figma_project_help_step_scopes_body(),
      alt: m.figma_project_help_step_scopes_alt()
    },
    {
      image: devScopesImage,
      title: m.figma_project_help_step_dev_scopes_title(),
      body: m.figma_project_help_step_dev_scopes_body(),
      alt: m.figma_project_help_step_dev_scopes_alt()
    }
  ]

  return (
    <IntegrationWalkthrough
      slides={slides}
      title={m.figma_project_help_title()}
      subtitle={m.figma_project_help_subtitle()}
      triggerLabel={m.figma_project_help_trigger_label()}
      previousLabel={m.figma_project_help_previous_label()}
      nextLabel={m.figma_project_help_next_label()}
      stepLabel={(index, total) =>
        m.figma_project_help_dot_label({ index, total })
      }
      imageClassName="object-contain"
      captionClassName="min-h-[5.5rem]"
    />
  )
}
