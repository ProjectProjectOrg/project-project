CREATE FUNCTION notify_project_change(project_id uuid, kind text, item text) RETURNS void LANGUAGE sql AS $$
  SELECT pg_notify(
    'project_sync',
    json_build_object('project', project_id, 'kind', kind, 'id', item)::text
  );
$$;
--> statement-breakpoint
CREATE FUNCTION notify_project_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind text := TG_ARGV[0];
  item text := TG_ARGV[1];
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_row := to_jsonb(OLD);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_row := to_jsonb(NEW);
  END IF;
  IF old_row = new_row THEN
    RETURN NULL;
  END IF;
  IF new_row IS NOT NULL THEN
    PERFORM notify_project_change((new_row ->> 'project_id')::uuid, kind, new_row ->> item);
  END IF;
  IF old_row IS NOT NULL AND (
    new_row IS NULL
    OR old_row ->> 'project_id' IS DISTINCT FROM new_row ->> 'project_id'
    OR old_row ->> item IS DISTINCT FROM new_row ->> item
  ) THEN
    PERFORM notify_project_change((old_row ->> 'project_id')::uuid, kind, old_row ->> item);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notify_ticket_index_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_index
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('tickets', 'ticket_id');
--> statement-breakpoint
CREATE FUNCTION notify_ticket_sprint_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.sprint_id IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR OLD.sprint_id IS DISTINCT FROM NEW.sprint_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
  ) THEN
    PERFORM notify_project_change(NEW.project_id, 'sprints', NEW.sprint_id);
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.sprint_id IS NOT NULL AND (
    TG_OP = 'DELETE'
    OR OLD.sprint_id IS DISTINCT FROM NEW.sprint_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
  ) THEN
    PERFORM notify_project_change(OLD.project_id, 'sprints', OLD.sprint_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notify_ticket_sprint_change
AFTER INSERT OR DELETE OR UPDATE OF project_id, sprint_id ON ticket_index
FOR EACH ROW EXECUTE FUNCTION notify_ticket_sprint_change();
--> statement-breakpoint
CREATE TRIGGER notify_ticket_relation_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_relation_index
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('tickets', 'from_ticket_id');
--> statement-breakpoint
CREATE TRIGGER notify_ticket_branch_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_branch
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('tickets', 'ticket_id');
--> statement-breakpoint
CREATE TRIGGER notify_ticket_activity_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_activity
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('tickets', 'ticket_id');
--> statement-breakpoint
CREATE TRIGGER notify_comment_change
AFTER INSERT OR UPDATE OR DELETE ON comment_index
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('comments', 'ticket_id');
--> statement-breakpoint
CREATE TRIGGER notify_ticket_subscription_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_subscription
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('subscribers', 'ticket_id');
--> statement-breakpoint
CREATE TRIGGER notify_project_status_change
AFTER INSERT OR UPDATE OR DELETE ON project_status
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('project', NULL);
--> statement-breakpoint
CREATE TRIGGER notify_project_tag_change
AFTER INSERT OR UPDATE OR DELETE ON project_tag
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('project', NULL);
--> statement-breakpoint
CREATE TRIGGER notify_project_git_automation_change
AFTER INSERT OR UPDATE OR DELETE ON project_git_automation
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('project', NULL);
--> statement-breakpoint
CREATE TRIGGER notify_project_integration_change
AFTER INSERT OR UPDATE OR DELETE ON project_integration_link
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('project', NULL);
--> statement-breakpoint
CREATE TRIGGER notify_project_member_change
AFTER INSERT OR DELETE OR UPDATE OF project_id, user_id, role_id ON project_member
FOR EACH ROW EXECUTE FUNCTION notify_project_row_change('project', NULL);
--> statement-breakpoint
CREATE FUNCTION notify_org_project_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_org text;
  new_org text;
BEGIN
  IF TG_TABLE_NAME = 'organization' THEN
    old_org := OLD.id;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      old_org := OLD.organization_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_org := NEW.organization_id;
    END IF;
  END IF;
  PERFORM notify_project_change(id, 'project', NULL)
    FROM project_index
    WHERE organization_id IN (old_org, new_org);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notify_org_member_project_change
AFTER INSERT OR DELETE OR UPDATE OF organization_id, user_id, role ON member
FOR EACH ROW EXECUTE FUNCTION notify_org_project_change();
--> statement-breakpoint
CREATE TRIGGER notify_org_visibility_project_change
AFTER UPDATE OF deleted_at, slug ON organization
FOR EACH ROW EXECUTE FUNCTION notify_org_project_change();
--> statement-breakpoint
CREATE FUNCTION notify_project_index_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM notify_project_change(OLD.id, 'project', NULL);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notify_project_index_change
AFTER DELETE OR UPDATE OF organization_id, slug, published_at, key, name, icon, color, tone, colors, banner, icon_image, estimation, git_automation_forward_only ON project_index
FOR EACH ROW EXECUTE FUNCTION notify_project_index_change();
