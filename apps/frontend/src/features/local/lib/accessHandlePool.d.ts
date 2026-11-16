declare module "@effect/wa-sqlite/src/examples/AccessHandlePoolVFS.js" {
  type WasmModule = Awaited<
    ReturnType<typeof import("@effect/wa-sqlite/dist/wa-sqlite.mjs")>
  >
  export const AccessHandlePoolVFS: {
    create(name: string, module: WasmModule): Promise<SQLiteVFS>
  }
}
