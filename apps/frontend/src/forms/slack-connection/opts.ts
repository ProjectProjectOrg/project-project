import { ConnectSlackInput } from "@pp/shared"
import { createValidator } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import { appFormOptions } from "@/lib/form"

const Bot = Schema.Struct({ token: ConnectSlackInput.fields.botToken })
const App = Schema.Struct({ token: ConnectSlackInput.fields.appToken })
const Account = Schema.Struct({
  clientId: ConnectSlackInput.fields.clientId,
  clientSecret: ConnectSlackInput.fields.clientSecret
})

export const botSchema = Schema.toStandardSchemaV1(Bot)
export const appSchema = Schema.toStandardSchemaV1(App)
export const accountSchema = Schema.toStandardSchemaV1(Account)
export const stepValidator = createValidator({
  triggers: [
    {
      trigger: "change",
      when: ({ groupApi, formApi }) =>
        (groupApi?.state.submissionAttempts ??
          formApi.state.submissionAttempts) > 0
    }
  ]
})

export const slackConnectionOpts = appFormOptions({
  defaultValues: {
    bot: { token: "" },
    app: { token: "" },
    account: { clientId: "", clientSecret: "" }
  },
  validators: [
    {
      run: Schema.toStandardSchemaV1(
        Schema.Struct({ bot: Bot, app: App, account: Account })
      ),
      triggers: []
    }
  ]
})
