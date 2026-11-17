import { LastView, scopeOf } from "@pp/local"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const USER_KEY = "pp:boot:local-user"
const VIEWS_KEY = "pp:boot:local-views"

const Views = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({ path: Schema.String, view: LastView })
  )
)
const decodeViews = Schema.decodeUnknownOption(Views)
const encodeViews = Schema.encodeSync(Views)

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    storage()?.setItem(key, value)
  } catch {
    storage()?.removeItem(key)
  }
}

export const rememberLocalUser = (userId: string) => {
  if (storage()?.getItem(USER_KEY) !== userId) write(USER_KEY, userId)
}

let written: string | null = null

export const rememberLocalView = (view: LastView) => {
  if (Object.keys(view.request.pages).length > 0) return
  const views = Option.getOrElse(
    decodeViews(storage()?.getItem(VIEWS_KEY)),
    () => ({})
  )
  const next = encodeViews({
    ...views,
    [scopeOf(view.request.project)]: {
      path: `${location.pathname}${location.search}`,
      view
    }
  })
  if (next === written) return
  written = next
  write(VIEWS_KEY, next)
}

declare global {
  var __ppLocalWorker: unknown
  var __ppLocalUser: unknown
}

const takeEarly = () => {
  const worker = globalThis.__ppLocalWorker
  const user = globalThis.__ppLocalUser
  globalThis.__ppLocalWorker = undefined
  globalThis.__ppLocalUser = undefined
  return worker instanceof Worker ? { worker, user } : null
}

export const takeEarlyWorker = (userId: string): Worker | null => {
  const early = takeEarly()
  if (early === null) return null
  if (early.user === userId) return early.worker
  early.worker.terminate()
  return null
}

export const releaseEarlyWorker = () => {
  takeEarly()?.worker.terminate()
}
