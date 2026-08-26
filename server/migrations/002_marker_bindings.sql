-- Marker-anchored asset placements ("spaces").
--
-- One row = one asset bound to one image marker. The transform columns are
-- MARKER-RELATIVE, never world coordinates: SLAM invents a fresh world origin
-- on every app launch, so a world position is meaningless across sessions,
-- while "12 cm out from this printed picture" survives a cold start. Restoring
-- a scene = re-detecting the marker and multiplying its live pose by these
-- stored offsets.
--
-- Position and rotation are stored decomposed (three translation floats + a
-- quaternion + a uniform scale) rather than as a packed 16-float matrix, so
-- the values stay inspectable in psql and a bad placement is diagnosable
-- without reconstructing a matrix by hand.
create table if not exists marker_bindings (
  id          uuid primary key,
  owner_id    text not null,
  -- Image-target name from the fingerprint JSON; the space's id AND origin.
  marker_name text not null,
  asset_url   text not null,
  asset_name  text not null,
  -- Offset from the marker origin, in the marker's own axes, in metres.
  -- pos_z is distance out of the printed surface — what the slider drives.
  pos_x       double precision not null default 0,
  pos_y       double precision not null default 0,
  pos_z       double precision not null default 0,
  -- Orientation relative to the marker, as a quaternion.
  quat_x      double precision not null default 0,
  quat_y      double precision not null default 0,
  quat_z      double precision not null default 0,
  quat_w      double precision not null default 1,
  scale       double precision not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The only read path is "everything this device has, for these markers".
create index if not exists marker_bindings_owner_marker_idx
  on marker_bindings (owner_id, marker_name);
