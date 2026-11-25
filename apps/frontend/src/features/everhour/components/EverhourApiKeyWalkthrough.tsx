import applicationAccessImage from "@/assets/everhour-walkthrough/everhour-application-access.png"
import profileMenuImage from "@/assets/everhour-walkthrough/everhour-profile-menu.png"
import projectProjectKeyImage from "@/assets/everhour-walkthrough/projectproject-everhour-key.png"
import { IntegrationWalkthrough } from "@/components/shell/IntegrationWalkthrough"
import { m } from "@/paraglide/messages"

export function EverhourApiKeyWalkthrough() {
  const slides = [
    {
      image: profileMenuImage,
      title: m.project_settings_everhour_help_step_profile_menu_title(),
      body: m.project_settings_everhour_help_step_profile_menu_body(),
      alt: m.project_settings_everhour_help_step_profile_menu_alt()
    },
    {
      image: applicationAccessImage,
      title: m.project_settings_everhour_help_step_token_title(),
      body: m.project_settings_everhour_help_step_token_body(),
      alt: m.project_settings_everhour_help_step_token_alt()
    },
    {
      image: projectProjectKeyImage,
      title: m.project_settings_everhour_help_step_projectproject_title(),
      body: m.project_settings_everhour_help_step_projectproject_body(),
      alt: m.project_settings_everhour_help_step_projectproject_alt()
    }
  ]

  return (
    <IntegrationWalkthrough
      slides={slides}
      title={m.project_settings_everhour_help_title()}
      subtitle={m.project_settings_everhour_help_subtitle()}
      triggerLabel={m.project_settings_everhour_help_trigger_label()}
      previousLabel={m.project_settings_everhour_help_previous_label()}
      nextLabel={m.project_settings_everhour_help_next_label()}
      stepLabel={(index, total) =>
        m.project_settings_everhour_help_dot_label({ index, total })
      }
      imageClassName="object-cover"
      captionClassName="min-h-[4.5rem]"
    />
  )
}
