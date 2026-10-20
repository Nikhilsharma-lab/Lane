-- Approved Project-scoped labels; existing labels stay workspace-wide.
BEGIN;
ALTER TABLE public.workspace_labels ADD COLUMN project_id uuid;
ALTER TABLE public.workspace_labels ADD CONSTRAINT workspace_labels_project_fk FOREIGN KEY (org_id, project_id) REFERENCES public.projects(org_id, id);
DROP INDEX public.workspace_labels_org_name_unique;
CREATE UNIQUE INDEX workspace_labels_org_name_unique ON public.workspace_labels(org_id, lower(name)) WHERE project_id IS NULL;
CREATE UNIQUE INDEX workspace_labels_project_name_unique ON public.workspace_labels(org_id, project_id, lower(name)) WHERE project_id IS NOT NULL;
ALTER TABLE public.workspace_labels DROP CONSTRAINT workspace_labels_name_check;
ALTER TABLE public.workspace_labels ADD CONSTRAINT workspace_labels_name_check CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name) AND (project_id IS NOT NULL OR lower(name) NOT IN ('bug','improvement','new feature')));
CREATE OR REPLACE FUNCTION public.validate_request_labels() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.label_keys IS NOT DISTINCT FROM OLD.label_keys AND NEW.request_type IS DISTINCT FROM OLD.request_type THEN
   NEW.label_keys := ARRAY(SELECT key FROM unnest(COALESCE(NEW.label_keys, ARRAY[]::text[])) AS key WHERE key NOT IN ('bug','improvement','new_feature')) || CASE WHEN NEW.request_type IS NULL THEN ARRAY[]::text[] ELSE ARRAY[NEW.request_type::text] END;
 END IF;
 IF NEW.label_keys IS NULL THEN
   NEW.label_keys := CASE WHEN NEW.request_type IS NULL THEN ARRAY[]::text[] ELSE ARRAY[NEW.request_type::text] END;
 END IF;
 IF cardinality(NEW.label_keys) > 20 OR array_position(NEW.label_keys, NULL) IS NOT NULL
   OR cardinality(NEW.label_keys) <> (SELECT count(DISTINCT key) FROM unnest(NEW.label_keys) AS key)
   OR EXISTS (SELECT 1 FROM unnest(NEW.label_keys) AS key WHERE key NOT IN ('bug','improvement','new_feature') AND NOT EXISTS (
     SELECT 1 FROM public.workspace_labels label WHERE label.id::text = key AND label.org_id = NEW.org_id AND (label.project_id IS NULL OR label.project_id = NEW.project_id)
   )) THEN RAISE EXCEPTION 'Invalid workspace labels' USING ERRCODE='23514'; END IF;
 NEW.request_type := CASE WHEN 'new_feature' = ANY(NEW.label_keys) THEN 'new_feature'::public.request_type
 WHEN 'bug' = ANY(NEW.label_keys) THEN 'bug'::public.request_type
 WHEN 'improvement' = ANY(NEW.label_keys) THEN 'improvement'::public.request_type ELSE NULL END;
 RETURN NEW;
END $$;
DROP TRIGGER requests_validate_labels ON public.requests;
CREATE TRIGGER requests_validate_labels BEFORE INSERT OR UPDATE OF label_keys, request_type, org_id, project_id ON public.requests FOR EACH ROW EXECUTE FUNCTION public.validate_request_labels();
COMMIT;
