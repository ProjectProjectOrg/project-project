CREATE FUNCTION "project_keeps_a_pm"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."role_id" <> 'pm' OR (TG_OP = 'UPDATE' AND NEW."role_id" = 'pm') THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM "project_index" WHERE "id" = OLD."project_id" FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "project_member"
    WHERE "project_id" = OLD."project_id" AND "role_id" = 'pm'
  ) THEN
    RAISE EXCEPTION 'project % would be left without a pm', OLD."project_id"
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = 'project_keeps_a_pm',
        DETAIL = OLD."project_id";
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "project_keeps_a_pm"
  AFTER DELETE OR UPDATE OF "role_id" ON "project_member"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "project_keeps_a_pm"();
