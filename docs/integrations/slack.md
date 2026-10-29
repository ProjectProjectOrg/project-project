# Slack integration

Each self-hosted installation uses its own Slack app. An organization owner or
admin opens organization settings → Integrations → Slack. The setup guide walks
through app creation, the bot token, the app-level token and personal account
linking. Back/Continue keeps entered values while you move between steps.

Before creating the app, set `BETTER_AUTH_URL` to the installation's
browser-facing HTTPS URL. Its hostname is registered for ticket previews, and
`/api/integrations/slack/oauth/callback` is registered as the OAuth redirect URL.
The browser must be able to reach that URL; Slack receives events through an
outbound Socket Mode connection, so an inbound Events API Request URL is not
needed. `localhost` and raw IP addresses do not support app link previews. See
[Slack's Socket Mode guide](https://docs.slack.dev/apis/events-api/using-socket-mode/)
and [link preview domain requirements](https://docs.slack.dev/messaging/unfurling-links-in-messages/#domains).

1. **Create the app.** Choose Create Slack app in PP, select the target workspace,
   review the generated manifest, then create the app. The manifest supplies the
   required permissions, Socket Mode setting, preview domain and redirect URL.
2. **Install it and copy the bot token.** In Slack's app settings, open
   **OAuth & Permissions → OAuth Tokens**, install the app to the workspace and
   choose Allow. Copy **Bot User OAuth Token** into PP's Bot token field. It
   starts with `xoxb-`. If the workspace requires app approval, an administrator
   needs to approve the installation.
3. **Generate the app-level token.** Open **Basic Information → App-Level Tokens
   → Generate Token and Scopes**. Give it a name, add `connections:write`, then
   choose Generate. Paste the resulting `xapp-` value into PP's App-level token
   field. These steps follow [Slack's app setup guide](https://docs.slack.dev/tools/bolt-python/creating-an-app/).
4. **Configure personal account linking.** Open **Basic Information → App
   Credentials**. Copy **Client ID** and reveal **Client Secret**, then paste
   them into the matching PP fields. These identify the same app during
   [Slack account linking](https://docs.slack.dev/authentication/sign-in-with-slack/).
   The [credential locations](https://docs.slack.dev/authentication/authorizing-with-postman/#2-obtain-the-client-id-and-client-secret)
   are documented by Slack. Choose **Connect workspace** to check and save all
   four values.

Use credentials from the same Slack app. **Signing Secret** and **Verification
Token** are not used by this Socket Mode integration. Credentials are encrypted
using `USER_SECRET_ENCRYPTION_KEY`. V1 connects a Slack workspace to one PP
organization. Updating credentials skips app creation; Cancel clears the draft.

For the app icon, download the PP image from setup and upload it in Slack under
**Basic Information → Display Information → App icon**. This is separate from
the JSON manifest. If the PP address changes, update **OAuth & Permissions →
Redirect URLs** and **Event Subscriptions → App unfurl domains**, then reinstall
the app after changing the preview domain.

Invite the bot to the desired channel. A project PM can then select that channel
and the enabled ticket/sprint events in project settings → integrations, refresh
the channel list after inviting the bot, and queue a test notification. Delivery
runs through the existing Postgres-backed Effect workflow engine. Temporary
failures and rate limits retry in the background, including across restarts;
Slack is never contacted while saving a ticket. Exhausted or permanent failures
are retained on the delivery record. Retrying an interrupted delivery may still
produce a duplicate if Slack accepted the message before PP recorded success.

When someone shares a ticket link before linking their account, Slack privately
prompts them to connect PP using Slack OAuth. The link goes through PP sign-in
if needed, then Slack authorization. Once connected, new ticket links can show
previews; re-share the original link if its preview has not appeared. Accounts
can also be linked or disconnected through profile settings.
Sharing a full ticket URL can show a summary in any supported Slack conversation,
independently of project notification subscriptions. PP checks the sharer's
current access before publishing. Everyone in that conversation can see the
summary; opening the ticket still requires PP access. Ticket bodies, comments
and attachments are not included. Commands, ticket mutations and the future AI
bot are outside v1.
