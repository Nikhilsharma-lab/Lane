-- PROTOTYPE (#344). Lane's profiles/organizations after the fresh start
-- (avatar_url removed), plus the six Better Auth tables from #333 Q3.
-- image/logo/metadata exist here; reset-db.sh lean drops them.
create type plan as enum ('free', 'pro');
create type profile_role as enum ('pm', 'designer', 'developer');

create table organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  owner_id text,
  plan plan not null default 'free',
  last_request_number integer not null default 0 check (last_request_number >= 0),
  logo text,
  metadata text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id text primary key,
  full_name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  role profile_role not null default 'designer',
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session (
  id text primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references profiles(id) on delete cascade,
  active_organization_id text
);
create index session_user_id_idx on session(user_id);

create table account (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references profiles(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_user_id_idx on account(user_id);

create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verification_identifier_idx on verification(identifier);

create table member (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table invitation (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  email text not null,
  role text,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  inviter_id text not null references profiles(id) on delete cascade
);

create table rate_limit (
  id text primary key,
  key text not null unique,
  count integer not null,
  last_request bigint not null
);
