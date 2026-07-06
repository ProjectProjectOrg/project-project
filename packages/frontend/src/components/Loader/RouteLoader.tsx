import { Loader } from "./Loader"

export function RouteLoader() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <Loader size={112} />
    </div>
  )
}
