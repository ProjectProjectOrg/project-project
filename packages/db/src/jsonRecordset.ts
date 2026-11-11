import { getTableColumns, sql, type InferInsertModel } from "drizzle-orm"
import { alias, type PgTable } from "drizzle-orm/pg-core"

// Binds any number of rows as one jsonb parameter, so bulk statements never hit
// the driver's 32,767 bind-parameter limit. Keys a row leaves out read as null,
// not as the column default.
export const jsonRecordset = <T extends PgTable>(
  table: T,
  name: string,
  rows: ReadonlyArray<Partial<InferInsertModel<T>>>
) => {
  const columns = Object.entries(getTableColumns(table))
  const columnNames = new Map(
    columns.map(([key, column]) => [key, column.name])
  )
  const json = JSON.stringify(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).flatMap(([key, value]) => {
          const columnName = columnNames.get(key)
          return columnName === undefined ? [] : [[columnName, value]]
        })
      )
    )
  )
  const from = sql`jsonb_populate_recordset(null::${table}, ${json}::jsonb) as ${sql.identifier(name)}`
  return {
    rows: alias(table, name),
    from,
    select: sql`select ${sql.join(
      columns.map(([, column]) => sql.identifier(column.name)),
      sql`, `
    )} from ${from}`
  }
}
