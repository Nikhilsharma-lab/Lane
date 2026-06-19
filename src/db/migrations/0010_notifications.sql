-- Notifications table: one row per recipient, best-effort insert at lifecycle hooks.
-- No stored message text — the UI renders from (type, actor, request) at read time.

CREATE TYPE notification_type AS ENUM (
  'request_picked_up',
  'comment_added',
  'request_done',
  'invite_accepted'
);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  request_id  uuid REFERENCES requests(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, read_at);
