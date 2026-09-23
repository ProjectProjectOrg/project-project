const databaseName = process.env.PROJECTPROJECT_TEST_DATABASE_NAME

if (
  !databaseName ||
  !/^projectproject_effect_v4_[a-f0-9]{16}$/.test(databaseName)
) {
  throw new Error("PROJECTPROJECT_TEST_DATABASE_NAME is invalid")
}

if (!process.argv.includes("--cleanup")) {
  await Bun.$`docker compose up --wait --wait-timeout 60 postgres`
}

await Bun.$`docker compose exec -T postgres dropdb --if-exists --force -U projectproject ${databaseName}`

if (!process.argv.includes("--cleanup")) {
  await Bun.$`docker compose exec -T postgres createdb -U projectproject ${databaseName}`
}
