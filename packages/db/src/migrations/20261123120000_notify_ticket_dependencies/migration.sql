CREATE TRIGGER notify_ticket_relation_target_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_relation_index
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('tickets', 'to_ticket_id');
--> statement-breakpoint
CREATE FUNCTION notify_ticket_parent_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.parent IS NOT DISTINCT FROM NEW.parent
    AND OLD.status IS NOT DISTINCT FROM NEW.status
    AND OLD.archived_at IS NOT DISTINCT FROM NEW.archived_at THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.parent IS NOT NULL THEN
    PERFORM notify_project_change(OLD.project_id, 'tickets', OLD.parent);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.parent IS NOT NULL THEN
    PERFORM notify_project_change(NEW.project_id, 'tickets', NEW.parent);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notify_ticket_parent_progress
AFTER INSERT OR DELETE OR UPDATE OF parent, status, archived_at ON ticket_index
FOR EACH ROW EXECUTE FUNCTION notify_ticket_parent_progress();
