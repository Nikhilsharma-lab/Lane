-- Approved workspace labels. Preserve legacy request_type as a derived gate value.
BEGIN;
CREATE TABLE public.workspace_labels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 name text NOT NULL,
 colour text NOT NULL,
 created_by text NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT workspace_labels_name_check CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name) AND lower(name) NOT IN ('bug','improvement','new feature')),
 CONSTRAINT workspace_labels_colour_check CHECK (colour IN ('red','blue','green','yellow','purple','grey'))
);
CREATE UNIQUE INDEX workspace_labels_org_name_unique ON public.workspace_labels(org_id, lower(name));
CREATE INDEX workspace_labels_created_by_idx ON public.workspace_labels(created_by);
ALTER TABLE public.workspace_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_labels FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.workspace_labels FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.workspace_labels FROM authenticated; END IF;
END $$;
ALTER TABLE public.requests ADD COLUMN label_keys text[];
ALTER TABLE public.requests DISABLE TRIGGER set_updated_at_requests;
UPDATE public.requests SET label_keys = CASE WHEN request_type IS NULL THEN ARRAY[]::text[] ELSE ARRAY[request_type::text] END;
ALTER TABLE public.requests ENABLE TRIGGER set_updated_at_requests;
-- No Data API access: Clerk-authorized server actions own access, like Projects.
CREATE FUNCTION public.validate_request_labels() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
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
     SELECT 1 FROM public.workspace_labels label WHERE label.id::text = key AND label.org_id = NEW.org_id
   )) THEN RAISE EXCEPTION 'Invalid workspace labels' USING ERRCODE='23514'; END IF;
 NEW.request_type := CASE WHEN 'new_feature' = ANY(NEW.label_keys) THEN 'new_feature'::public.request_type
 WHEN 'bug' = ANY(NEW.label_keys) THEN 'bug'::public.request_type
 WHEN 'improvement' = ANY(NEW.label_keys) THEN 'improvement'::public.request_type ELSE NULL END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_request_labels() FROM PUBLIC;
CREATE TRIGGER requests_validate_labels BEFORE INSERT OR UPDATE OF label_keys, request_type, org_id ON public.requests FOR EACH ROW EXECUTE FUNCTION public.validate_request_labels();
COMMIT;
