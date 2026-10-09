-- Permanent LAN-n display numbers, allocated independently per workspace.
-- UUIDs remain Request identity and route keys. Conflict retries may leave gaps.
-- Apply only after a verified backup; staging before production.
BEGIN;

-- Match the usual Request insert -> workspace lock order. Bound migration
-- waiting so a busy workspace fails safely instead of queuing indefinitely.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.requests, public.organizations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.organizations
  ADD COLUMN last_request_number integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT organizations_last_request_number_check
    CHECK (last_request_number >= 0);
ALTER TABLE public.requests ADD COLUMN request_number integer;

-- Backfilling an identity must not look like a person edited the Request or
-- workspace. These named triggers are restored before this transaction commits.
ALTER TABLE public.requests DISABLE TRIGGER set_updated_at_requests;
ALTER TABLE public.organizations DISABLE TRIGGER set_updated_at_organizations;

WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY org_id ORDER BY created_at, id
  )::integer AS request_number
  FROM public.requests
)
UPDATE public.requests AS request
SET request_number = numbered.request_number
FROM numbered
WHERE request.id = numbered.id;

UPDATE public.organizations AS organization
SET last_request_number = COALESCE((
  SELECT max(request.request_number)
  FROM public.requests AS request
  WHERE request.org_id = organization.id
), 0);

ALTER TABLE public.requests ENABLE TRIGGER set_updated_at_requests;
ALTER TABLE public.organizations ENABLE TRIGGER set_updated_at_organizations;

-- Zero is an insert-only sentinel for callers that omit the field. The BEFORE
-- INSERT allocator replaces it before these constraints can allow a saved row.
ALTER TABLE public.requests
  ALTER COLUMN request_number SET DEFAULT 0,
  ALTER COLUMN request_number SET NOT NULL,
  ADD CONSTRAINT requests_request_number_check CHECK (request_number > 0),
  ADD CONSTRAINT requests_org_request_number_unique UNIQUE (org_id, request_number);

CREATE FUNCTION public.guard_organization_request_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.last_request_number < OLD.last_request_number THEN
    RAISE EXCEPTION 'A workspace Request counter cannot decrease'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_organization_request_counter
  BEFORE UPDATE OF last_request_number ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_request_counter();

-- Preserve the existing timestamp behavior for every ordinary UPDATE,
-- including no-op metadata writes. Only a counter-only change skips it.
DROP TRIGGER set_updated_at_organizations ON public.organizations;
CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  WHEN (
    OLD.last_request_number IS NOT DISTINCT FROM NEW.last_request_number
    OR (to_jsonb(OLD) - 'last_request_number')
      IS DISTINCT FROM (to_jsonb(NEW) - 'last_request_number')
  )
  EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.allocate_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.request_number IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Request numbers are allocated by Lane'
      USING ERRCODE = '23514';
  END IF;

  -- Updating the existing workspace row serializes concurrent creates in that
  -- workspace. The counter and Request insert commit or roll back together.
  UPDATE public.organizations
  SET last_request_number = last_request_number + 1
  WHERE id = NEW.org_id
  RETURNING last_request_number INTO NEW.request_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Request workspace does not exist'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER allocate_request_number
  BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.allocate_request_number();

CREATE FUNCTION public.guard_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.request_number IS DISTINCT FROM OLD.request_number
    OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'A saved Request number and workspace cannot change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_request_number
  BEFORE UPDATE OF request_number, org_id ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_number();

-- Existing table RLS and grants remain unchanged; functions run as the caller.
COMMIT;
