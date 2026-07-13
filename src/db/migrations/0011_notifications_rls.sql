-- Record the notifications RLS state already present in production.
-- No direct-client policy is intentional: Lane reads and writes notifications
-- through guarded server actions using the server-side database connection.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
