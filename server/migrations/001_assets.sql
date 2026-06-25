create table if not exists assets (
  id            uuid primary key,
  owner_id      text not null,
  storage_key   text not null,
  content_type  text not null,
  is_animated   boolean not null default false,
  width         int  not null,
  height        int  not null,
  byte_size     int  not null,
  original_name text,
  created_at    timestamptz not null default now()
);
create index if not exists assets_owner_created_idx on assets (owner_id, created_at desc);
