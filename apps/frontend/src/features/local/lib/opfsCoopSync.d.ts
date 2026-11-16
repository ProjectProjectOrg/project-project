declare module "@effect/wa-sqlite/src/examples/OPFSCoopSyncVFS.js" {
  type WasmModule = Awaited<
    ReturnType<typeof import("@effect/wa-sqlite/dist/wa-sqlite.mjs")>
  >
  export const OPFSCoopSyncVFS: {
    create(name: string, module: WasmModule): Promise<SQLiteVFS>
  }
}
