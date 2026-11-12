import { appFormOptions } from "@/lib/form"

export type FlagTicketValues = Readonly<{ reason: string }>

const defaultValues: FlagTicketValues = { reason: "" }

export const flagTicketFormOpts = appFormOptions({ defaultValues })
