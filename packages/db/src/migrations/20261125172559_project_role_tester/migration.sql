INSERT INTO "project_role" ("id", "name") VALUES ('tester', 'Tester') ON CONFLICT ("id") DO NOTHING;
